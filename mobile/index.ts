// mobile/index.ts
// 앱 진입점. 안드로이드가 지오펜스 이벤트로 꺼진 앱을 깨우면 화면(라우트 파일)은 안 뜨므로,
// 백그라운드 태스크는 라우터보다 먼저 여기서 정의해야 한다.
import './src/features/arrival/task';
import 'expo-router/entry';
