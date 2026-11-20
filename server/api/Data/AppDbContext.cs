using Microsoft.EntityFrameworkCore;

namespace Resenha.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(user =>
        {
            user.HasIndex(u => u.Username).IsUnique();
            user.Property(u => u.Username).HasMaxLength(AccountRules.UsernameMaxLength);
            user.Property(u => u.DisplayName).HasMaxLength(AccountRules.DisplayNameMaxLength);
            user.Property(u => u.AvatarFile).HasMaxLength(64);
            user.Property(u => u.BannerFile).HasMaxLength(64);
        });
    }
}
