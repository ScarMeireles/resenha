using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Resenha.Api.Data;

namespace Resenha.Api.Tests;

/// <summary>Migrações que mexem em tabela com dados de quem já usa o app (o SQLite recria a tabela por baixo).</summary>
public class MigrationTests
{
    [Fact]
    public async Task ConversasDiretas_preserva_mensagens_e_imagens_de_grupo_existentes()
    {
        var folder = Path.Combine(Path.GetTempPath(), "resenha-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={Path.Combine(folder, "resenha.db")}").Options;
        try
        {
            string U(Guid id) => id.ToString().ToUpperInvariant(); // é assim que o EF guarda Guid no SQLite
            var (user, group, message, image) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());

            await using (var db = new AppDbContext(options))
            {
                await db.GetService<IMigrator>().MigrateAsync("20261120175531_StatusEChamadaPerdida");
                await db.Database.ExecuteSqlAsync(
                    $"""
                     INSERT INTO Users (Id, Username, DisplayName, PasswordHash, SecurityStamp, CreatedAt, Status)
                         VALUES ({U(user)}, 'antigo', 'Antigo', 'x', {U(Guid.NewGuid())}, '2026-11-20 10:00:00+00:00', 'online');
                     INSERT INTO Groups (Id, Name, OwnerId, CreatedAt) VALUES ({U(group)}, 'G', {U(user)}, '2026-11-20 10:00:00+00:00');
                     INSERT INTO GroupMembers (GroupId, UserId, JoinedAt) VALUES ({U(group)}, {U(user)}, '2026-11-20 10:00:00+00:00');
                     INSERT INTO Messages (Id, GroupId, AuthorId, Text, CreatedAt) VALUES ({U(message)}, {U(group)}, {U(user)}, 'velha', 1);
                     INSERT INTO MessageImages (Id, MessageId, File, Width, Height, "Order") VALUES ({U(image)}, {U(message)}, 'a.webp', 1, 1, 0);
                     """);
            }

            await using (var db = new AppDbContext(options))
            {
                await db.Database.MigrateAsync();
                var kept = await db.Messages.Include(m => m.Images).SingleAsync();
                Assert.Equal(group, kept.GroupId);
                Assert.Null(kept.ConversationId);
                Assert.Equal("velha", kept.Text);
                Assert.Equal(image, Assert.Single(kept.Images).Id);

                // A restrição do banco recusa mensagem sem grupo nem conversa.
                db.Messages.Add(new Message { AuthorId = user, Text = "solta", CreatedAt = DateTimeOffset.UtcNow });
                await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            }
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            try { Directory.Delete(folder, recursive: true); } catch (IOException) { }
        }
    }
}
