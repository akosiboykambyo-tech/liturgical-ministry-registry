# Liturgical Ministry Registry

A centralized database system for tracking and verifying active members across the six standard liturgical ministries (Altar Servers, Lectors/Commentators, Extraordinary Ministers of Holy Communion, Ushers/Greeters, Music Ministry, and Catechists). 

This platform enables immediate verification of a member's standing via a public lookup tool or by scanning the unique QR code printed on their official certificate.

---

## Key Features

* **Centralized Registry:** Track active status, training history, and appointment dates across all six liturgical ministries.
* **Public Verification Lookup:** Quick-search interface for parish leaders and coordinators to confirm member standing instantly.
* **QR Code Integration:** Dynamic QR code generation for official certificates, routing directly to the verified member record.
* **Role-Based Access Control:** Role segregation between administrative staff, ministry leads, and public verification views.

---

## Tech Stack

* **Database:** PostgreSQL / MySQL
* **Backend:** Node.js / Python (Django/FastAPI)
* **Frontend:** React / Vue.js
* **QR Generation:** QRCode / Canvas API

---

## Getting Started

### Prerequisites

* Node.js (v18.0 or higher)
* PostgreSQL (v14 or higher)

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-org/ministry-database.git](https://github.com/your-org/ministry-database.git)
   cd ministry-database
