using Microsoft.EntityFrameworkCore;
using Resenha.Api.Groups;

namespace Resenha.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Friendship> Friendships => Set<Friendship>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<MessageImage> MessageImages => Set<MessageImage>();

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

        modelBuilder.Entity<Group>(group =>
        {
            group.Property(g => g.Name).HasMaxLength(GroupRules.NameMaxLength);
            group.HasOne<User>().WithMany().HasForeignKey(g => g.OwnerId).OnDelete(DeleteBehavior.Restrict);
            group.HasMany(g => g.Members).WithOne().HasForeignKey(m => m.GroupId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GroupMember>(member =>
        {
            member.HasKey(m => new { m.GroupId, m.UserId });
            member.HasIndex(m => m.UserId);
            member.HasOne(m => m.User).WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Message>(message =>
        {
            message.Property(m => m.Text).HasMaxLength(GroupRules.MessageMaxLength);
            // SQLite não ordena DateTimeOffset no banco; guardamos como ticks UTC (número) para ordenar e paginar.
            message.Property(m => m.CreatedAt).HasConversion(v => v.UtcTicks, v => new DateTimeOffset(v, TimeSpan.Zero));
            message.HasIndex(m => new { m.GroupId, m.CreatedAt });
            message.HasOne<Group>().WithMany().HasForeignKey(m => m.GroupId).OnDelete(DeleteBehavior.Cascade);
            message.HasOne(m => m.Author).WithMany().HasForeignKey(m => m.AuthorId).OnDelete(DeleteBehavior.Restrict);
            message.HasMany(m => m.Images).WithOne().HasForeignKey(i => i.MessageId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MessageImage>(image => image.Property(i => i.File).HasMaxLength(64));
    }
}
