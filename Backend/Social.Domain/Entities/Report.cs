using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class Report
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid ReporterId { get; set; } // Người đi report

        public string TargetType { get; set; } = string.Empty; // "Post" hoặc "User"
        public Guid TargetId { get; set; } // ID của bài viết hoặc ID người dùng bị report

        public string Reason { get; set; } = string.Empty; // Lý do báo cáo

        public string Status { get; set; } = "Pending"; // Trạng thái: Pending, Resolved, Rejected

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}