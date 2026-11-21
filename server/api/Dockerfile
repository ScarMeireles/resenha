# Imagem da API para o servidor real (deploy/docker-compose.yml). Funciona em x64 e em ARM.
# Etapa 1: compila. Etapa 2: só o runtime, menor e sem o SDK.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Resenha.Api.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# Banco SQLite e imagens ficam no volume /data (fora da imagem, sobrevive a atualizações).
ENV ASPNETCORE_HTTP_PORTS=8080 \
    Storage__Root=/data
# A pasta já nasce do usuário "app" (sem root), para o volume novo herdar a permissão de escrita.
RUN mkdir /data && chown $APP_UID /data
VOLUME /data
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Resenha.Api.dll"]
