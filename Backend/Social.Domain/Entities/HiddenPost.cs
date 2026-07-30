using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class HiddenPost
    {
        public Guid UserId { get; set; } // ID người đã bấm ẩn
        public Guid PostId { get; set; } // ID bài viết bị ẩn
        public DateTime HiddenAt { get; set; } = DateTime.UtcNow;
    }
}
