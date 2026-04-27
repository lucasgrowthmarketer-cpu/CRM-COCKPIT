# Stage 1: Build React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
RUN yarn build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# nginx:alpine entrypoint auto-substitutes env vars in *.template files
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built React app
COPY --from=builder /app/build /usr/share/nginx/html

# Railway injects $PORT
EXPOSE ${PORT}

# nginx:alpine default CMD already runs envsubst on /etc/nginx/templates/*
CMD ["nginx", "-g", "daemon off;"]
