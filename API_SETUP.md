# 은시세 사이트 API 연결

브라우저는 외부 API를 직접 호출하지 않습니다.

- `/api/current` : Cloudflare Pages Function에서 Gold API + Frankfurter를 호출
- `/api/history` : Cloudflare Pages Function에서 Gold API 과거 데이터를 호출

Cloudflare Pages → Settings → Variables and secrets 에서
`GOLD_API_KEY`를 Production Secret으로 등록한 뒤 재배포하세요.

배포 후 테스트:
- https://silver-today.com/api/current
- https://silver-today.com/api/history?days=30

API 키는 HTML이나 GitHub 코드에 직접 적지 마세요.
