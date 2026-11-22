# Stage 1: Build React + TypeScript frontend with pnpm
FROM node:22-alpine AS frontend-build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app/src/PubQuiz.Client
COPY src/PubQuiz.Client/package.json src/PubQuiz.Client/pnpm-workspace.yaml src/PubQuiz.Client/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY src/PubQuiz.Client/ ./
RUN pnpm run build

# Stage 2: Build .NET 10 ASP.NET Core backend
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS backend-build
WORKDIR /app
COPY PubQuiz.sln ./
COPY src/PubQuiz.Server/PubQuiz.Server.csproj src/PubQuiz.Server/
RUN dotnet restore src/PubQuiz.Server/PubQuiz.Server.csproj
COPY src/PubQuiz.Server/ src/PubQuiz.Server/
COPY --from=frontend-build /app/src/PubQuiz.Server/wwwroot src/PubQuiz.Server/wwwroot
RUN dotnet publish src/PubQuiz.Server/PubQuiz.Server.csproj -c Release -o /out -p:SkipFrontendBuild=true --no-restore

# Stage 3: Minimal low-memory production runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app
ENV ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_GCServer=0 \
    DOTNET_GCHeapHardLimitPercent=75 \
    PORT=5080

COPY --from=backend-build /out ./
COPY quizzes ./quizzes
RUN mkdir -p /app/state

EXPOSE 5080
ENTRYPOINT ["dotnet", "PubQuiz.Server.dll"]
