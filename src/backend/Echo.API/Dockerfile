FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/backend/Echo.slnx src/backend/Echo.slnx
COPY src/backend/Echo.Domain/Echo.Domain.csproj src/backend/Echo.Domain/
COPY src/backend/Echo.Application/Echo.Application.csproj src/backend/Echo.Application/
COPY src/backend/Echo.Infrastructure/Echo.Infrastructure.csproj src/backend/Echo.Infrastructure/
COPY src/backend/Echo.API/Echo.API.csproj src/backend/Echo.API/
RUN dotnet restore src/backend/Echo.slnx

COPY src/backend/ src/backend/
RUN dotnet publish src/backend/Echo.API/Echo.API.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Echo.API.dll"]
