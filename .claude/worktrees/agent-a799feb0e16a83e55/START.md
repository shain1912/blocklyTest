# 🚀 한 번에 프론트엔드 + 백엔드 실행하기

## 빠른 시작

```bash
npm start
```

이 명령어 하나로 프론트엔드와 백엔드가 동시에 실행됩니다!

## 실행되는 서버들

### 🎨 프론트엔드 (Vite)
- **주소**: http://localhost:5173
- **기술**: React + Vite + Blockly

### 🔧 백엔드 API
- **주소**: http://localhost:3001
- **기술**: Node.js HTTP Server

## 사용 가능한 명령어

```bash
# 프론트엔드 + 백엔드 동시 실행
npm start

# 프론트엔드만 실행
npm run dev
# 또는
npm run start:frontend

# 백엔드만 실행
npm run server

# 테스트 실행
npm test

# 빌드
npm run build
```

## 백엔드 API 엔드포인트

### GET /api/health
서버 상태 확인
```bash
curl http://localhost:3001/api/health
```

### GET /api/hello
간단한 인사 메시지
```bash
curl http://localhost:3001/api/hello
```

### POST /api/data
데이터 전송 및 응답
```bash
curl -X POST http://localhost:3001/api/data \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Backend!"}'
```

## 프론트엔드에서 백엔드 호출 예제

```javascript
// 간단한 fetch 예제
const response = await fetch('http://localhost:3001/api/hello');
const data = await response.json();
console.log(data);

// POST 요청 예제
const postResponse = await fetch('http://localhost:3001/api/data', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ message: 'Hello from frontend!' })
});
const postData = await postResponse.json();
console.log(postData);
```

## 서버 종료

터미널에서 `Ctrl + C`를 누르면 프론트엔드와 백엔드가 모두 종료됩니다.

## 커스터마이징

### 백엔드 서버 수정
[server.js](server.js) 파일을 수정하여 새로운 API 엔드포인트를 추가하거나 로직을 변경할 수 있습니다.

### 포트 변경
- 프론트엔드: [vite.config.js](vite.config.js)의 `server.port` 수정
- 백엔드: [server.js](server.js)의 `PORT` 상수 수정

## 문제 해결

### 포트가 이미 사용 중인 경우

```bash
# 5173 포트 사용 중인 프로세스 찾기
lsof -ti:5173

# 3001 포트 사용 중인 프로세스 찾기
lsof -ti:3001

# 프로세스 종료 (PID는 위 명령어로 확인한 값)
kill -9 <PID>
```

### npm start 실행 시 에러가 나는 경우

```bash
# 의존성 재설치
rm -rf node_modules package-lock.json
npm install

# 다시 실행
npm start
```
