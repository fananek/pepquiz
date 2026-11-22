using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using PubQuiz.Server.Models;

namespace PubQuiz.Server.Services;

public sealed record ResolvedTlsCertificate(
    X509Certificate2 Certificate,
    string SourceDescription,
    string? CaCertificatePemPath,
    IReadOnlyList<string> CoveredAddresses
);

/// <summary>
/// Loads a user-configured TLS certificate (PFX/PEM) or automatically generates and persists
/// a local CA + 365-day X.509 server certificate covering localhost and all active LAN IPv4 addresses.
/// </summary>
public static class LocalTlsCertificateService
{
    private const string InternalPfxPassword = "pubquiz-local-tls-key";

    public static ResolvedTlsCertificate LoadOrCreateCertificate(
        HttpsOptions options,
        string contentRootPath,
        string stateDirectoryConfig,
        ILogger? logger = null)
    {
        var customCertPath = Environment.GetEnvironmentVariable("QUIZ_HTTPS_CERT_PATH");
        if (string.IsNullOrWhiteSpace(customCertPath))
            customCertPath = options.CertificatePath;

        var customKeyPath = Environment.GetEnvironmentVariable("QUIZ_HTTPS_KEY_PATH");
        if (string.IsNullOrWhiteSpace(customKeyPath))
            customKeyPath = options.CertificateKeyPath;

        var customPassword = Environment.GetEnvironmentVariable("QUIZ_HTTPS_CERT_PASSWORD");
        if (string.IsNullOrEmpty(customPassword))
            customPassword = options.CertificatePassword;

        if (!string.IsNullOrWhiteSpace(customCertPath))
        {
            var resolvedCertPath = Path.IsPathRooted(customCertPath)
                ? customCertPath
                : Path.GetFullPath(Path.Combine(contentRootPath, customCertPath));

            if (!File.Exists(resolvedCertPath))
                throw new FileNotFoundException($"Konfigurovaný HTTPS certifikát nebyl nalezen: {resolvedCertPath}");

            X509Certificate2 loaded;
            if (!string.IsNullOrWhiteSpace(customKeyPath))
            {
                var resolvedKeyPath = Path.IsPathRooted(customKeyPath)
                    ? customKeyPath
                    : Path.GetFullPath(Path.Combine(contentRootPath, customKeyPath));
                using var pemCert = X509Certificate2.CreateFromPemFile(resolvedCertPath, resolvedKeyPath);
                var pfxBytes = pemCert.Export(X509ContentType.Pkcs12, InternalPfxPassword);
                loaded = X509CertificateLoader.LoadPkcs12(pfxBytes, InternalPfxPassword, X509KeyStorageFlags.Exportable);
            }
            else
            {
                loaded = X509CertificateLoader.LoadPkcs12FromFile(
                    resolvedCertPath,
                    string.IsNullOrEmpty(customPassword) ? null : customPassword,
                    X509KeyStorageFlags.Exportable);
            }

            return new ResolvedTlsCertificate(loaded, $"vlastní certifikát ({resolvedCertPath})", null, []);
        }

        var envDataDir = Environment.GetEnvironmentVariable("QUIZ_DATA_DIR");
        var stateDir = !string.IsNullOrWhiteSpace(envDataDir)
            ? Path.GetFullPath(Path.Combine(envDataDir, "state"))
            : JwtTokenService.ResolvePath(contentRootPath, stateDirectoryConfig);

        var certsDir = Path.Combine(stateDir, "certs");
        Directory.CreateDirectory(certsDir);
        RestrictDirectoryPermissions(certsDir);

        var caPfxPath = Path.Combine(certsDir, "pubquiz-ca.pfx");
        var caPemPath = Path.Combine(certsDir, "pubquiz-ca.crt");
        var serverPfxPath = Path.Combine(certsDir, "pubquiz-server.pfx");
        var serverPemPath = Path.Combine(certsDir, "pubquiz-server.crt");

        var lanIps = NetworkInfoService.GetAllLanIpv4Addresses();
        var hostName = Environment.MachineName?.Trim() ?? string.Empty;

        using var caCert = LoadOrCreateLocalCa(caPfxPath, caPemPath, logger);

        // Reuse existing server certificate if still valid (> 30 days left) and covers all current LAN IPs
        if (File.Exists(serverPfxPath))
        {
            try
            {
                var existing = X509CertificateLoader.LoadPkcs12FromFile(
                    serverPfxPath, InternalPfxPassword, X509KeyStorageFlags.Exportable);

                if (existing.HasPrivateKey &&
                    existing.NotAfter.ToUniversalTime() > DateTime.UtcNow.AddDays(30) &&
                    existing.Issuer == caCert.Subject &&
                    CoversAllIps(existing, lanIps))
                {
                    return new ResolvedTlsCertificate(
                        existing,
                        $"lokální LAN certifikát ({serverPfxPath})",
                        caPemPath,
                        lanIps);
                }

                existing.Dispose();
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "Cached TLS server certificate could not be loaded; regenerating.");
            }
        }

        var serverCert = CreateAndSaveServerCertificate(caCert, lanIps, hostName, serverPfxPath, serverPemPath);
        logger?.LogInformation(
            "Generated local HTTPS certificate covering localhost and LAN IP(s): {Ips}",
            lanIps.Count > 0 ? string.Join(", ", lanIps) : "(loopback only)");

        return new ResolvedTlsCertificate(
            serverCert,
            $"lokální LAN certifikát ({serverPfxPath})",
            caPemPath,
            lanIps);
    }

    private static X509Certificate2 LoadOrCreateLocalCa(string caPfxPath, string caPemPath, ILogger? logger)
    {
        if (File.Exists(caPfxPath))
        {
            try
            {
                var existing = X509CertificateLoader.LoadPkcs12FromFile(
                    caPfxPath, InternalPfxPassword, X509KeyStorageFlags.Exportable);

                if (existing.HasPrivateKey && existing.NotAfter.ToUniversalTime() > DateTime.UtcNow.AddDays(90))
                {
                    if (!File.Exists(caPemPath))
                        File.WriteAllText(caPemPath, existing.ExportCertificatePem());
                    return existing;
                }

                existing.Dispose();
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "Cached local CA could not be loaded; regenerating.");
            }
        }

        using var caKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var caReq = new CertificateRequest(
            "CN=PubQuiz Engine Local CA, O=PubQuiz Engine",
            caKey,
            HashAlgorithmName.SHA256);

        caReq.CertificateExtensions.Add(new X509BasicConstraintsExtension(
            certificateAuthority: true,
            hasPathLengthConstraint: true,
            pathLengthConstraint: 0,
            critical: true));

        caReq.CertificateExtensions.Add(new X509KeyUsageExtension(
            X509KeyUsageFlags.KeyCertSign | X509KeyUsageFlags.CrlSign,
            critical: true));

        caReq.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(caReq.PublicKey, critical: false));

        var now = DateTimeOffset.UtcNow;
        using var createdCa = caReq.CreateSelfSigned(now.AddMinutes(-5), now.AddYears(10));

        var pfxBytes = createdCa.Export(X509ContentType.Pkcs12, InternalPfxPassword);
        WriteSecretFile(caPfxPath, pfxBytes);
        File.WriteAllText(caPemPath, createdCa.ExportCertificatePem());

        return X509CertificateLoader.LoadPkcs12(pfxBytes, InternalPfxPassword, X509KeyStorageFlags.Exportable);
    }

    private static X509Certificate2 CreateAndSaveServerCertificate(
        X509Certificate2 caCert,
        List<string> lanIps,
        string hostName,
        string serverPfxPath,
        string serverPemPath)
    {
        using var leafKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var leafReq = new CertificateRequest(
            "CN=PubQuiz Local Server, O=PubQuiz Engine",
            leafKey,
            HashAlgorithmName.SHA256);

        leafReq.CertificateExtensions.Add(new X509BasicConstraintsExtension(
            certificateAuthority: false,
            hasPathLengthConstraint: false,
            pathLengthConstraint: 0,
            critical: true));

        leafReq.CertificateExtensions.Add(new X509KeyUsageExtension(
            X509KeyUsageFlags.DigitalSignature,
            critical: true));

        leafReq.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(
            new OidCollection { new("1.3.6.1.5.5.7.3.1") }, // id-kp-serverAuth
            critical: true));

        leafReq.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(leafReq.PublicKey, critical: false));

        var sanBuilder = new SubjectAlternativeNameBuilder();
        sanBuilder.AddDnsName("localhost");
        sanBuilder.AddIpAddress(IPAddress.Loopback);
        sanBuilder.AddIpAddress(IPAddress.IPv6Loopback);

        if (!string.IsNullOrWhiteSpace(hostName) &&
            hostName.All(c => char.IsLetterOrDigit(c) || c == '-' || c == '.'))
        {
            sanBuilder.AddDnsName(hostName);
            if (!hostName.EndsWith(".local", StringComparison.OrdinalIgnoreCase))
                sanBuilder.AddDnsName($"{hostName}.local");
        }

        foreach (var ipStr in lanIps)
        {
            if (IPAddress.TryParse(ipStr, out var ip))
                sanBuilder.AddIpAddress(ip);
        }

        leafReq.CertificateExtensions.Add(sanBuilder.Build());

        var serial = RandomNumberGenerator.GetBytes(16);
        serial[0] &= 0x7F; // positive ASN.1 integer
        if (serial[0] == 0) serial[0] = 1;

        var now = DateTimeOffset.UtcNow;
        // <= 365 days complies with modern Apple / Chrome leaf certificate lifetime limits (max 398 days)
        using var signedPublic = leafReq.Create(caCert, now.AddMinutes(-5), now.AddDays(365), serial);
        using var signedWithKey = signedPublic.CopyWithPrivateKey(leafKey);

        var pfxBytes = signedWithKey.Export(X509ContentType.Pkcs12, InternalPfxPassword);
        WriteSecretFile(serverPfxPath, pfxBytes);
        File.WriteAllText(serverPemPath, signedPublic.ExportCertificatePem());

        return X509CertificateLoader.LoadPkcs12(pfxBytes, InternalPfxPassword, X509KeyStorageFlags.Exportable);
    }

    private static bool CoversAllIps(X509Certificate2 cert, List<string> requiredIps)
    {
        if (requiredIps.Count == 0)
            return true;

        var sanExt = cert.Extensions["2.5.29.17"];
        if (sanExt is null)
            return false;

        var formatted = sanExt.Format(multiLine: false);
        foreach (var ip in requiredIps)
        {
            if (!formatted.Contains(ip, StringComparison.Ordinal))
                return false;
        }
        return true;
    }

    public static void WriteSecretFile(string path, byte[] content)
    {
        var tempPath = path + ".tmp";
        File.WriteAllBytes(tempPath, content);
        RestrictFilePermissions(tempPath);
        File.Move(tempPath, path, overwrite: true);
        RestrictFilePermissions(path);
    }

    public static void RestrictFilePermissions(string path)
    {
        if (OperatingSystem.IsWindows())
            return;
        try
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        catch
        {
            // Best-effort on filesystems without POSIX permissions
        }
    }

    private static void RestrictDirectoryPermissions(string path)
    {
        if (OperatingSystem.IsWindows())
            return;
        try
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }
        catch
        {
            // Best-effort
        }
    }
}
