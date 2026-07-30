using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class SavedPost
    {
        public Guid UserId { get; set; }
        public Guid PostId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}