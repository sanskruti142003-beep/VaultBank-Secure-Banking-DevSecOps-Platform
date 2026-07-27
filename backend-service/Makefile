.PHONY: up infra-up apps-up gateway-up gateway-test gateway-reload down logs reset vault-init rabbit-status redis-cli

up: infra-up

infra-up:
	docker compose up -d postgres redis rabbitmq vault

apps-up:
	docker compose up -d --build auth-service account-service transaction-service payment-service

gateway-up:
	docker compose up -d --build nginx

gateway-test:
	sh nginx/scripts/test-gateway.sh

gateway-reload:
	docker exec banking-nginx nginx -t
	docker exec banking-nginx nginx -s reload

down:
	docker compose down

logs:
	docker compose logs -f

reset:
	docker compose down -v

vault-init:
	docker compose exec vault sh /vault/init/vault-init.sh

rabbit-status:
	@echo "RabbitMQ Management UI: http://localhost:$${RABBITMQ_MANAGEMENT_PORT:-15672}"

redis-cli:
	docker compose exec redis sh -c 'REDISCLI_AUTH="$$REDIS_PASSWORD" redis-cli --no-auth-warning'
