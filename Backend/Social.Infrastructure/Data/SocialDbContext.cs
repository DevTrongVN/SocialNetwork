using Microsoft.EntityFrameworkCore;
using Social.Domain.Entities;
using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Infrastructure.Data
{
    public class SocialDbContext : DbContext
    {
        public SocialDbContext(DbContextOptions<SocialDbContext> options) : base(options)
        {
        }

        // Khai báo bảng Users
        public DbSet<User> Users { get; set; }

        // Khai báo bảng Messages
        public DbSet<Message> Messages { get; set; }

        public DbSet<Post> Posts { get; set; }

        public DbSet<Comment> Comments { get; set; }

        public DbSet<Follow> Follows { get; set; }

        public DbSet<Notification> Notifications { get; set; }

        public DbSet<PostLike> PostLikes { get; set; }

        public DbSet<Friendship> Friendships { get; set; }

        public DbSet<Block> Blocks { get; set; }

        public DbSet<SavedPost> SavedPosts { get; set; }

        public DbSet<Report> Reports { get; set; }

        public DbSet<Story> Stories { get; set; }

        public DbSet<StoryView> StoryViews { get; set; }

        public DbSet<SearchHistory> SearchHistories { get; set; }

        public DbSet<ChatGroup> ChatGroups { get; set; }
        
        public DbSet<GroupMember> GroupMembers { get; set; }

        public DbSet<HiddenPost> HiddenPosts { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Cấu hình thêm (nếu cần) ví dụ như độ dài cột, unique email...
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();
            modelBuilder.Entity<Follow>()
                .HasKey(f => new { f.FollowerId, f.FollowingId });
            // KHÓA CỦA BẢNG FRIENDSHIP
            modelBuilder.Entity<Friendship>()
                .HasKey(f => new { f.RequesterId, f.ReceiverId });
            modelBuilder.Entity<PostLike>()
                .HasKey(pl => new { pl.PostId, pl.UserId });
            modelBuilder.Entity<Block>()
                .HasKey(b => new { b.BlockerId, b.BlockedId });
            // Cấu hình bảng SavedPost
            modelBuilder.Entity<SavedPost>()
                .HasKey(sp => new { sp.UserId, sp.PostId });
            // KHÓA CỦA BẢNG LƯỢT XEM STORY (1 Người chỉ tính 1 lượt xem trên 1 Story)
            modelBuilder.Entity<StoryView>()
                .HasKey(sv => new { sv.StoryId, sv.ViewerId });

            modelBuilder.Entity<HiddenPost>().HasKey(hp => new { hp.UserId, hp.PostId });
        }

    }
}