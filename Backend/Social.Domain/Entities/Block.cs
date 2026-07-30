using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class Block
    {
        public Guid BlockerId { get; set; } // Người đi chặn
        public Guid BlockedId { get; set; } // Người bị chặn
        public string? Reason { get; set; } // Lý do (Tùy chọn)
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}