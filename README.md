\# Dev Trọng - Comprehensive Social Network



\## Overview

Dev Trọng is a full-featured, real-time social networking platform. It is designed to provide users with a seamless and interactive communication experience, featuring everything from personalized newsfeeds and privacy controls to end-to-end encrypted (E2EE) messaging and Peer-to-Peer (P2P) video/audio calls.



\## Key Features



\### 📱 Core Social Features

\- \*\*Authentication \& Security:\*\* Secure login and registration with OTP email verification and JWT-based session management.

\- \*\*Dynamic Newsfeed \& Profile:\*\* Post status updates, photos, and videos. Supports rich interactions including multi-reaction system (Like, Love, Haha, Wow, Sad, Angry), nested comments, and post sharing.

\- \*\*Granular Privacy Controls:\*\* Customize visibility for each post individually (Public, Friends, Friends of Friends, Only Me) and configure comment permissions.

\- \*\*Story System:\*\* Upload 24-hour stories with automatic deletion and view tracking.

\- \*\*Network Management:\*\* Send, accept, and manage friend requests, follow users, or block/mute specific accounts.



\### 💬 Advanced Real-Time Chat (SignalR)

\- \*\*1-on-1 \& Group Chats:\*\* Instant messaging powered by SignalR.

\- \*\*End-to-End Encryption (E2EE):\*\* Messages and media files are securely encrypted on the client side using CryptoJS before reaching the server.

\- \*\*Smart Messaging:\*\* Features include "Delete for Me", "Recall Message" (both sides), specific message replies, and real-time typing indicators.

\- \*\*Media Sharing:\*\* Securely upload and view encrypted images and videos within the chat window.



\### 📞 WebRTC Audio \& Video Calls

\- \*\*P2P Communication:\*\* Direct, low-latency video and audio calling implemented via WebRTC.

\- \*\*Interactive Call UI:\*\* Floating call badges, call duration tracking, ringing/missed call alerts, and integrated call logs directly inside the chat history.



\## Tech Stack



\### Backend

\- \*\*Framework:\*\* C# with ASP.NET Core Web API

\- \*\*Real-Time Communication:\*\* SignalR

\- \*\*Database:\*\* SQL Server with Entity Framework Core

\- \*\*Authentication:\*\* JWT (JSON Web Tokens) \& BCrypt for password hashing



\### Frontend

\- \*\*Languages:\*\* HTML5, Vanilla JavaScript (ES6+), CSS3

\- \*\*Styling:\*\* Tailwind CSS (with Dark/Light mode support)

\- \*\*Security:\*\* CryptoJS for E2EE message encryption

\- \*\*Communication:\*\* WebRTC API for media streaming



\## Author

\*\*Nguyen Quoc Trong\*\* \*Information Technology Student at Ho Chi Minh City University of Industry and Trade (HUIT)\*

