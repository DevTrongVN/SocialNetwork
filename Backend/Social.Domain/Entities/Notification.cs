using System;

namespace Social.Domain.Entities
{
    public class Notification
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid UserId { get; set; } // Người NHẬN thông báo
        public Guid? SenderId { get; set; } // Người GÂY RA thông báo (Tùy chọn)

        public string Type { get; set; } = "System"; // Phân loại: Like, Comment, Share, Friend...
        public Guid? RelatedId { get; set; } // Chứa ID bài viết hoặc ID người dùng để bấm vào chuyển trang

        public string Content { get; set; } = string.Empty;
        public bool IsRead { get; set; } = false; // Đánh dấu đã đọc/chưa đọc

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}