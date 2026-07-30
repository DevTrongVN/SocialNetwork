using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class Story
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; } // Ai đăng Story này?
        public string ImageUrl { get; set; } = string.Empty; // Ảnh/Video đăng lên

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow; // Thời điểm đăng

        // TỰ ĐỘNG HỦY SAU 24 TIẾNG
        public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddHours(24);
    }
}