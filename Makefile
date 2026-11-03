.PHONY: test test-contracts test-agent verify-tee build-frontend dev-agent dev-frontend

test:
	npm test

test-contracts:
	npm run contracts:test

test-agent:
	npm run agent:test

verify-tee:
	npm run verify:tee

build-frontend:
	npm run build:frontend

dev-agent:
	python packages/agent/agent.py

dev-frontend:
	npm --prefix packages/frontend run dev
