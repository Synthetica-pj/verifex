# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# 🔥 HARSH CPU/MEMORY CONSTRAINTS
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV TF_NUM_INTRAOP_THREADS=1
ENV TF_NUM_INTEROP_THREADS=1

# Install system dependencies with aggressive retries and mirror switching
RUN apt-get update || (sed -i 's/deb.debian.org/ftp.us.debian.org/g' /etc/apt/sources.list && apt-get update) || (sed -i 's/ftp.us.debian.org/ftp.debian.org/g' /etc/apt/sources.list && apt-get update)
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libssl-dev \
    pkg-config \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install Python dependencies
# Note: We use --no-cache-dir to keep the image size small
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8501

# Command to run the application
CMD ["python", "app_server.py"]
