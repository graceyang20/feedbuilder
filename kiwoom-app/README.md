# 배포 가이드 (코딩 지식 0, 터미널 사용 안 함)

이 폴더 하나만 있으면 GitHub 업로드 + Vercel 배포로 실제 링크가 나와요.
컴퓨터에 아무것도 설치할 필요 없습니다 (터미널/git 명령어 없음).

---

## 1단계. GitHub 계정 만들기 (이미 있으면 건너뛰기)

1. https://github.com/signup 접속
2. 이메일 / 비밀번호 / 아이디 입력하고 가입 완료

## 2단계. 새 저장소(repository) 만들기

1. 로그인 후 오른쪽 위 **+** 버튼 → **New repository** 클릭
2. Repository name에 아무 이름 입력 (예: `kakaopay-feed-builder`)
3. **Public** 선택 (심사자가 볼 수 있어야 하니까)
4. 다른 옵션은 전부 건드리지 말고 **Create repository** 클릭

## 3단계. 이 폴더를 그대로 업로드하기 (드래그 앤 드롭, 코딩 없음)

1. 방금 만든 저장소 페이지에서 **"uploading an existing file"** 링크 클릭
   (안 보이면 위쪽 **Add file → Upload files** 버튼)
2. 다운로드받은 `kiwoom-app` 폴더를 **압축 해제**한 뒤,
   그 안의 내용물(폴더/파일)을 통째로 브라우저 화면에 **드래그해서 끌어다 놓기**
   - ⚠️ `kiwoom-app` 폴더 자체를 끌지 말고, **그 폴더 안의 내용물**을 끌어야 합니다.
   - `node_modules` 폴더는 포함되어 있지 않으니 신경 쓸 필요 없어요.
3. 아래 **Commit changes** 초록 버튼 클릭 → 업로드 완료

## 4단계. Vercel 계정 만들고 이 저장소 연결하기

1. https://vercel.com/signup 접속
2. **Continue with GitHub** 클릭 → 방금 만든 GitHub 계정으로 로그인/연동
3. Vercel 대시보드에서 **Add New... → Project** 클릭
4. 방금 만든 저장소(`kakaopay-feed-builder`)를 찾아서 **Import** 클릭
5. Framework Preset이 자동으로 **Vite**로 잡힙니다 (그대로 두면 됨)
6. **아직 Deploy 누르지 마세요.** 5단계 먼저 진행

## 5단계. 환경변수(비밀 키) 등록하기 — 가장 중요한 단계

Import 화면에서 아래로 스크롤하면 **Environment Variables** 섹션이 있습니다.
아래 3개를 한 줄씩 추가하세요 (Name / Value 두 칸에 각각 입력 후 **Add**):

| Name | Value |
|---|---|
| `KIWOOM_APP_KEY` | 본인이 발급받은 키움 앱키 |
| `KIWOOM_APP_SECRET` | 본인이 발급받은 키움 시크릿키 |
| `KIWOOM_BASE_URL` | `https://mockapi.kiwoom.com` |

⚠️ 절대로 이 값들을 코드 파일이나 GitHub에 직접 입력하지 마세요.
반드시 이 Vercel 화면에서만 입력합니다. 여기 입력한 값은 서버에서만 쓰이고
브라우저(사용자)에게는 절대 노출되지 않습니다.

## 6단계. 배포

1. 이제 **Deploy** 버튼 클릭
2. 1~2분 기다리면 빌드가 끝나고 **"Congratulations!"** 화면과 함께
   `https://프로젝트이름.vercel.app` 형태의 실제 링크가 나옵니다.
3. 이 링크가 과제에 제출할 실제 앱 링크입니다.

## 7단계. 제대로 됐는지 확인하기

1. 위에서 받은 링크를 브라우저에 열어서 앱 화면이 정상적으로 보이는지 확인
2. 주소 뒤에 `/api/kiwoom/token` 을 붙여서 접속
   (예: `https://프로젝트이름.vercel.app/api/kiwoom/token`)
3. 아래처럼 나오면 키움 mock API 토큰 발급까지 실제로 성공한 것입니다:

   ```json
   {
     "issued": true,
     "token_type": "bearer",
     "token_preview": "WQJCwy...1lv...",
     "expires_at": "2026-09-05T08:37:13+09:00",
     "seconds_until_expiry": 86391
   }
   ```

   만약 `"issued": false` 와 함께 에러 메시지가 나오면, 5단계의 환경변수 3개를
   다시 확인하세요 (Vercel 프로젝트 → Settings → Environment Variables에서
   수정 가능, 수정 후에는 Deployments 탭에서 최신 배포 옆 **⋯ → Redeploy**
   눌러야 반영됩니다).

---

## 이후에 코드를 수정하고 싶다면?

GitHub 저장소 페이지에서 파일을 클릭하면 연필 아이콘(✏️)으로 바로 웹에서
수정하고 **Commit changes**를 누르면 됩니다. Vercel이 자동으로 다시 배포해서
1~2분 뒤 링크에 반영됩니다. 터미널이나 git 명령어는 계속 필요 없습니다.

## 참고: 이 프로젝트가 하는 일

- `/` : 지금까지 만든 UI 프로토타입 (React, 정적 화면)
- `/api/kiwoom/token` : 서버에서만 실행되는 코드. 키움 mock API에
  `POST /oauth2/token`을 호출해서 토큰을 발급받고, 만료 5분 전이면
  자동으로 다시 발급받습니다 (`kiwoom-rest-api-spec.json`의 `au10001` 규격
  그대로 구현).
