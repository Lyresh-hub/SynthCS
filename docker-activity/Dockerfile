# Use the official Node.js image as the base
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json to the container
COPY package.json package.json

# Install dependencies
RUN npm install

# Copy the application code to the container
COPY app.js app.js

# Expose port 3000
EXPOSE 3000

# Define the command to run the app
CMD ["npm", "start"]
