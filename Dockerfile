# Use Node.js LTS image
FROM node:22-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose port (Cloud Run will set the PORT environment variable)
EXPOSE 8080

# Start the app
CMD [ "node", "index.js" ]
