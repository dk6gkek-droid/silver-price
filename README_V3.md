# Silver Today V3 배포

## 핵심 추가
- 최근 5·10·20년 은 최대낙폭(MDD) 자동 계산
- 금 vs 은 5·10·20년 누적성과/MDD 비교
- 미국 금리인상기(2004~06, 2015~18, 2022~23) 금·은 비교 차트
- 국내·미국 은 ETF·ETN 가이드
- 은 1돈/1kg SEO 전용 페이지
- 은값 계산기 전용 페이지
- About / Privacy / Contact / Disclaimer
- sitemap.xml 확장
- 기존 GOLD_API_KEY 그대로 사용

## 배포
GitHub 저장소 루트에 ZIP 내부 파일/폴더를 그대로 덮어쓰고 Commit 하면 됩니다.
`functions/api/longterm.js`가 새로 추가되므로 functions 폴더도 반드시 올려 주세요.

## 주의
Gold API 무료 History API는 호출 제한이 있으므로 longterm endpoint는 6시간 캐시를 사용합니다.
장기 데이터 공급 범위가 부족하면 MDD/장기비교 섹션은 “데이터 확인 중”으로 남고 현재 은시세는 계속 동작합니다.

ETF/ETN 정보는 2026-08-26 기준 확인한 공식 자료 중심이며, 국내 ETN은 만기·상장폐지가 잦으므로 실제 투자 전 KRX/KIND 확인이 필요합니다.


## v33 안정화 적용
- /api/current 캐시: 1시간
- /api/history 캐시: 24시간
- /api/longterm 캐시: 48시간
- 모든 HTML에서 CSS 캐시버전 업데이트
- index.html JS 캐시버전 업데이트
- 메인화면 모바일 UI 미세조정(상단 오늘가격 칩 제거, 최근업데이트 줄정리, 리스크 제목 줄바꿈 개선)


## v34 콘텐츠/SEO 강화
- 메인 1g 제거, 실버바 100g·500g·1kg 중심
- 부가세 10% 단순 반영 비교값 추가
- 새 페이지: silver-bar-guide.html, silver-vs-gold.html
- risk/ETF 콘텐츠 깊이 및 FAQ/내부링크 강화
- sitemap 확장
