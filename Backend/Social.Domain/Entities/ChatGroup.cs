using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class ChatGroup
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }

        // Lưu lại ID của người đã tạo ra nhóm này
        public Guid CreatedBy { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}