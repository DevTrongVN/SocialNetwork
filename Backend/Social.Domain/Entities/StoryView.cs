using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class StoryView
    {
        public Guid StoryId { get; set; } // Xem Story nào?
        public Guid ViewerId { get; set; } // Ai là người xem?

        public DateTime ViewedAt { get; set; } = DateTime.UtcNow; // Xem lúc mấy giờ?
    }
}