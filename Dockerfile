FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir flask requests gunicorn
COPY . .
ENV EXPENSE_DB=/data/expenses.db PORT=5000
RUN mkdir -p /data
VOLUME /data
EXPOSE 5000
CMD ["sh", "-c", "gunicorn -b 0.0.0.0:${PORT} 'web:create_app()'"]
