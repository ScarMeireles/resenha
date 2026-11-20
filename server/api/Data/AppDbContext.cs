using Microsoft.EntityFrameworkCore;

namespace Resenha.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Friendship> Friendships => Set<Friendship>();

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

        modelBuilder.Entity<Friendship>(friendship =>
        {
            friendship.Property(f => f.Status).HasConversion<string>().HasMaxLength(16);
            friendship.HasIndex(f => new { f.RequesterId, f.AddresseeId }).IsUnique();
            friendship.HasIndex(f => f.AddresseeId);
            friendship.HasOne(f => f.Requester).WithMany().HasForeignKey(f => f.RequesterId).OnDelete(DeleteBehavior.Cascade);
            friendship.HasOne(f => f.Addressee).WithMany().HasForeignKey(f => f.AddresseeId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
