# 💸 SpendWise – Smart Expense Tracker

### Take Control of Your Money. Make Smarter Financial Decisions.

SpendWise is a smart personal finance management application designed to help users track expenses, manage budgets, monitor savings goals and understand their spending habits through intelligent financial insights.

Built using Python, Flask, SQL, HTML, CSS and JavaScript, SpendWise combines expense management with analytics and an interactive user interface.

---

## 🚀 Key Features

* **Expense Management:** Add, edit, delete, search and filter transactions.
* **Quick Add:** Enter expenses using natural language.
* **AI Financial Assistant:** Ask questions about spending and receive financial insights.
* **Budget Management:** Set monthly budgets and monitor spending limits.
* **Savings Goals:** Create financial goals and track progress.
* **Financial Health Score:** Understand financial habits with a score from 0–100.
* **Spending Analytics:** Analyze monthly expenses and category-wise spending.
* **Subscription Detection:** Identify recurring payments and estimate yearly costs.
* **Financial Insights:** Detect unusual expenses and spending patterns.
* **CSV Export:** Export transaction records.
* **Dark & Light Mode:** Switch between different visual themes.
* **Responsive UI:** Access the application across different screen sizes.

---

## 🛠️ Technology Stack

| Category        | Technologies                 |
| --------------- | ---------------------------- |
| Backend         | Python, Flask                |
| Frontend        | HTML5, CSS3, JavaScript      |
| Database        | SQLite, SQL                  |
| API             | REST API                     |
| Analytics       | Python, SQL                  |
| AI Integration  | Google Gemini API (Optional) |
| Testing         | Pytest                       |
| Deployment      | Docker                       |
| Version Control | Git, GitHub                  |

---

## 🏗️ Project Architecture

```text
SpendWise/
│
├── static/
│   ├── css/
│   ├── js/
│   └── index.html
│
├── tracker/
│   ├── db.py
│   ├── service.py
│   ├── insights.py
│   ├── analytics.py
│   └── demo.py
│
├── tests/
├── docs/
├── .github/
│
├── main.py
├── web.py
├── schema.sql
├── requirements.txt
├── Dockerfile
├── .env.example
├── .gitignore
└── README.md
```

---

## ⚙️ Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/devs901/spendwise-expense-tracker.git
```

### 2. Navigate to Project Directory

```bash
cd spendwise-expense-tracker
```

### 3. Create Virtual Environment

```bash
python -m venv venv
```

### 4. Activate Virtual Environment

**Windows:**

```bash
venv\Scripts\activate
```

**Linux / macOS:**

```bash
source venv/bin/activate
```

### 5. Install Dependencies

```bash
pip install -r requirements.txt
```

### 6. Run Application

```bash
python web.py
```

### 7. Open in Browser

```text
http://localhost:5000
```

Use the sample data option to explore the application's features.

---

## 🧠 Smart Financial Analytics

SpendWise provides intelligent financial analysis through:

* Monthly spending comparisons.
* Category-wise expense analysis.
* Budget performance monitoring.
* Financial health scoring.
* Recurring payment detection.
* Unusual expense detection.
* Monthly spending projections.

The financial assistant uses rule-based processing by default, with optional Gemini API integration.

---

## 🔌 REST API

| Method       | Endpoint             | Description                  |
| ------------ | -------------------- | ---------------------------- |
| GET / POST   | `/api/expenses`      | Retrieve and create expenses |
| PUT / DELETE | `/api/expenses/<id>` | Update and delete expenses   |
| GET          | `/api/summary`       | Financial summary            |
| GET          | `/api/monthly`       | Monthly analytics            |
| GET / POST   | `/api/budgets`       | Budget management            |
| GET          | `/api/insights`      | Financial insights           |
| GET          | `/api/analytics`     | Spending analytics           |
| POST         | `/api/ask`           | Financial assistant          |
| GET / POST   | `/api/goals`         | Savings goals                |
| GET          | `/api/export`        | Export transactions          |

---

## 🧪 Testing

Run the automated test suite:

```bash
pytest -q
```

---

## 🐳 Docker Support

Build the Docker image:

```bash
docker build -t spendwise .
```

Run the application:

```bash
docker run -p 5000:5000 -v spendwise-data:/data spendwise
```

---

## 🔮 Future Enhancements

* PostgreSQL and MySQL integration.
* User authentication and account management.
* Income tracking and financial reports.
* Receipt scanning using OCR.
* Progressive Web App support.
* Advanced financial recommendations.

---

## 👨‍💻 Developer

**Devendra Rathod**

AI & Data Science Graduate | Python Developer | Data Analyst

* GitHub: [@devs901](https://github.com/devs901)
* Project: [SpendWise Expense Tracker](https://github.com/devs901/spendwise-expense-tracker)

---

## 📄 License

This project is licensed under the MIT License.

---

⭐ If you find this project interesting, consider giving it a star!
