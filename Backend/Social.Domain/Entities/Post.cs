using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class Post
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        // Ai là người đăng bài?
        public Guid UserId { get; set; }
        public string AuthorName { get; set; } = string.Empty;

        // Nội dung bài đăng (Hoặc caption khi share)
        public string Content { get; set; } = string.Empty;

        // Đường dẫn ảnh (nếu có đăng kèm ảnh)
        public string? ImageUrl { get; set; }

        public int LikeCount { get; set; } = 0;

        // --- HỆ THỐNG CHIA SẺ (SHARE) ---
        public bool IsShare { get; set; } = false;
        public Guid? OriginalPostId { get; set; }

        // --- QUYỀN RIÊNG TƯ (Dành cho Post) ---
        // 0: Public, 1: Friends, 2: Only Me
        public int Privacy { get; set; } = 0;

        // --- SOFT DELETE & AUDIT ---
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
        public DateTime? DeletedAt { get; set; }
    }
}
