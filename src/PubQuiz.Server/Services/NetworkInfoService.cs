using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using Microsoft.Extensions.Options;
using PubQuiz.Server.Models;

namespace PubQuiz.Server.Services;

public sealed class NetworkInfoService
{
    private readonly PubQuizOptions _options;
    private readonly bool _trustProxy;
    private int _boundPort = 5443;
    private string _boundScheme = "https";

    public NetworkInfoService(IOptions<PubQuizOptions> options)
    {
        _options = options.Value;
        var portEnv = Environment.GetEnvironmentVariable("PORT");
        var trustProxyEnv = Environment.GetEnvironmentVariable("QUIZ_TRUST_PROXY");
        _trustProxy = _options.TrustForwardedHeaders
            || !string.IsNullOrWhiteSpace(portEnv)
            || string.Equals(trustProxyEnv, "true", StringComparison.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(portEnv) && int.TryParse(portEnv, out var parsed) && parsed > 0)
        {
            _boundPort = parsed;
            _boundScheme = "http";
        }
        else if (!_options.Https.Enabled)
        {
            _boundPort = _options.Https.HttpRedirectPort > 0 ? _options.Https.HttpRedirectPort : 5080;
            _boundScheme = "http";
        }
        else if (_options.Https.Port > 0)
        {
            _boundPort = _options.Https.Port;
            _boundScheme = "https";
        }
    }

    public void SetBoundEndpoint(string scheme, int port)
    {
        if (scheme is "http" or "https")
            _boundScheme = scheme;
        if (port > 0)
            _boundPort = port;
    }

    public void SetBoundPort(int port)
    {
        if (port > 0)
            _boundPort = port;
    }

    public string GetPublicBaseUrl(string? requestScheme = null, string? requestHost = null, int? fallbackPort = null)
    {
        var envUrl = Environment.GetEnvironmentVariable("QUIZ_PUBLIC_URL");
        if (!string.IsNullOrWhiteSpace(envUrl))
            return envUrl.TrimEnd('/');

        if (!string.IsNullOrWhiteSpace(_options.PublicBaseUrl))
            return _options.PublicBaseUrl.TrimEnd('/');

        var effectiveScheme = _boundScheme == "https" && !_trustProxy
            ? "https"
            : requestScheme is "http" or "https"
                ? requestScheme
                : _boundScheme;

        // Defense against Host Header Poisoning:
        // Only accept a request Host header if it is a valid host AND either:
        // (a) running behind a trusted cloud proxy, OR
        // (b) matches one of this machine's own LAN IPv4 addresses or local hostname.
        if (!string.IsNullOrWhiteSpace(requestHost) &&
            TryParseSafeHost(requestHost, out var hostName, out var explicitPort))
        {
            var isLoopback = hostName.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                || hostName.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
                || hostName.Equals("::1", StringComparison.OrdinalIgnoreCase);

            if (!isLoopback)
            {
                var isLocalOwnHost = IsLocalMachineHost(hostName);
                if (_trustProxy || isLocalOwnHost)
                {
                    // When local HTTPS is active, never downgrade to HTTP redirect port in advertised QR links
                    if (!_trustProxy && _boundScheme == "https")
                        return $"https://{FormatHost(hostName)}:{_boundPort}";

                    var portSuffix = explicitPort.HasValue ? $":{explicitPort.Value}" : string.Empty;
                    return $"{effectiveScheme}://{FormatHost(hostName)}{portSuffix}";
                }
            }
        }

        // Running locally on host's laptop -> prefer LAN IPv4 so phones can scan the QR code on Wi-Fi!
        var lanIp = GetPreferredLanIpv4();
        var port = fallbackPort ?? _boundPort;
        if (effectiveScheme == _boundScheme &&
            !string.IsNullOrWhiteSpace(requestHost) &&
            TryParseSafeHost(requestHost, out _, out var reqPort) &&
            reqPort.HasValue &&
            (_boundScheme != "https" || reqPort.Value == _boundPort))
        {
            port = reqPort.Value;
        }

        if (!string.IsNullOrWhiteSpace(lanIp))
            return $"{effectiveScheme}://{lanIp}:{port}";

        return $"{effectiveScheme}://localhost:{port}";
    }

    private static bool TryParseSafeHost(string rawHost, out string hostName, out int? port)
    {
        hostName = string.Empty;
        port = null;
        var trimmed = rawHost.Trim();
        if (trimmed.Length is 0 or > 255 ||
            trimmed.Contains('/') ||
            trimmed.Contains('\\') ||
            trimmed.Contains('@') ||
            trimmed.Any(char.IsWhiteSpace))
        {
            return false;
        }

        if (!Uri.TryCreate($"https://{trimmed}", UriKind.Absolute, out var uri) ||
            string.IsNullOrWhiteSpace(uri.Host))
        {
            return false;
        }

        hostName = uri.Host;
        port = uri.IsDefaultPort && !trimmed.EndsWith(":443", StringComparison.Ordinal) ? null : uri.Port;
        return true;
    }

    private static bool IsLocalMachineHost(string hostName)
    {
        var machine = Environment.MachineName;
        if (!string.IsNullOrWhiteSpace(machine) &&
            (hostName.Equals(machine, StringComparison.OrdinalIgnoreCase) ||
             hostName.Equals($"{machine}.local", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return GetAllLanIpv4Addresses().Contains(hostName, StringComparer.OrdinalIgnoreCase);
    }

    private static string FormatHost(string hostName) =>
        hostName.Contains(':') && !hostName.StartsWith('[') ? $"[{hostName}]" : hostName;

    public static List<string> GetAllLanIpv4Addresses()
    {
        var result = new List<string>();
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up)
                    continue;
                if (ni.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
                    continue;

                var props = ni.GetIPProperties();
                foreach (var unicast in props.UnicastAddresses)
                {
                    if (unicast.Address.AddressFamily != AddressFamily.InterNetwork)
                        continue;
                    if (IPAddress.IsLoopback(unicast.Address))
                        continue;

                    var ip = unicast.Address.ToString();
                    if (ip.StartsWith("169.254.", StringComparison.Ordinal))
                        continue; // link-local

                    result.Add(ip);
                }
            }
        }
        catch
        {
            // Ignore network interface discovery failures in restricted sandboxes
        }

        return result;
    }

    public static string? GetPreferredLanIpv4()
    {
        var ips = GetAllLanIpv4Addresses();
        return ips.FirstOrDefault(ip => ip.StartsWith("192.168.", StringComparison.Ordinal))
            ?? ips.FirstOrDefault(ip => ip.StartsWith("10.", StringComparison.Ordinal))
            ?? ips.FirstOrDefault(ip => ip.StartsWith("172.", StringComparison.Ordinal))
            ?? ips.FirstOrDefault();
    }
}
