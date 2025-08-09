# YouTube VPH Dashboard (Static Web App)

브라우저에서 YouTube Data API v3를 사용해 영상의 VPH(views per hour)를 계산/정렬합니다.

## 사용법
1) 이 폴더의 파일들을 GitHub 레포에 올립니다(GitHub Pages 추천).  
2) 페이지 접속 → 상단 섹션에서 **API 키 저장**  
3) 수집 모드(영상 URL / 채널 업로드 / 재생목록 / 검색) 중 선택 → 불러오기

## YouTube Data API 키 발급
- Google Cloud Console → YouTube Data API v3 **활성화** → Credentials → **Create API key**  
- 배포 시 보안을 위해 **HTTP referrer 제한** 설정 권장.

## 주의/한계
- 라이브/프리미어/Shorts는 VPH 해석이 다를 수 있음.  
- vidIQ의 내부 보정과 다를 수 있음(이 앱은 단순 계산: `조회수 / 경과시간(시간)`).

## 라이선스
MIT
