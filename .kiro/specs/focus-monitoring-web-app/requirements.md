# Requirements Document

## Introduction

focus-monitoring-web-app은 로그인한 사용자가 집중 시간을 설정하고 집중 세션을 시작하면 브라우저 카메라를 세션 동안에만 사용하여 얼굴 위치와 눈 상태를 감지하는 웹 애플리케이션이다. 눈 감김 상태 또는 얼굴 이탈 상태가 각각 7초 동안 지속되면 시각·청각 경고를 제공한다. 카메라 영상은 브라우저 안에서 처리하고 서버로 전송하지 않으며, 오탐 방지, 접근성, 브라우저 제약 대응, 세션 종료 시 자원 해제를 포함한다.

본 문서는 후속 `design.md`에서 시스템 구조와 인터페이스를 결정하고, 후속 `tasks.md`에서 5인 팀의 구현 작업을 배분할 수 있도록 책임 영역과 협업 경계를 요구사항 수준에서 정의한다. 본 단계에는 구현 코드와 상세 설계를 포함하지 않는다.

## Glossary

- **Focus_Monitoring_Web_App**: 로그인, 집중 세션 설정, 브라우저 기반 사용자 감지, 경고 제공을 통합하는 전체 웹 애플리케이션.
- **Authenticated_User**: Authentication_Service가 유효한 로그인 상태를 확인한 사용자.
- **Authentication_Service**: 사용자 로그인, 로그아웃, 인증 상태 확인을 담당하는 서비스.
- **Browser_Client**: 사용자의 지원 브라우저에서 실행되는 Focus_Monitoring_Web_App의 사용자 인터페이스.
- **API_Backend**: Python FastAPI로 구현되는 인증 및 집중 세션 API 서버.
- **Focus_Session**: Authenticated_User가 설정한 기간 동안 감시 기능이 활성화되는 단일 실행 단위.
- **Session_Controller**: Focus_Session의 설정, 시작, 남은 시간 계산, 수동 종료, 자동 종료, 상태 전이를 관리하는 Browser_Client 구성요소.
- **Session_Duration**: 분 단위로 설정하는 Focus_Session의 실행 시간이며 허용 범위는 1분 이상 240분 이하이다.
- **Monitoring_Switch**: Focus_Session 시작 시 켜지고 종료 시 꺼지는 단일 on/off 제어 상태.
- **Camera_Controller**: 브라우저 카메라 권한 요청, MediaStream 획득, 카메라 상태 표시, 미디어 트랙 해제를 담당하는 Browser_Client 구성요소.
- **Monitoring_Engine**: 카메라 프레임에서 얼굴, 얼굴 위치, 양쪽 눈 상태를 브라우저 내부에서 분석하는 구성요소.
- **Supported_Browser**: 카메라 MediaDevices API, 미디어 트랙 제어, 화면 애니메이션, 오디오 재생을 지원하며 HTTPS 또는 localhost 보안 컨텍스트에서 실행되는 최신 브라우저.
- **Operational_Camera**: 권한이 허용되고 활성 비디오 트랙에서 분석 가능한 프레임이 초당 5개 이상 제공되는 카메라 상태.
- **Detection_Range**: 단일 얼굴의 경계 상자 높이가 카메라 프레임 높이의 15% 이상 60% 이하이고 얼굴 중심이 프레임 내부에 있는 상태로 판정하는 적정 감지 거리 범위.
- **Positioning_Guidance**: 얼굴이 Detection_Range를 벗어나거나 둘 이상의 얼굴이 감지될 때 Browser_Client가 제공하는 카메라 위치 조정 안내.
- **Valid_Face_State**: Operational_Camera에서 정확히 한 개의 얼굴이 0.80 이상의 감지 신뢰도로 인식되고 Detection_Range를 충족하는 상태.
- **Open_Eye_State**: Valid_Face_State에서 양쪽 눈이 열림으로 판정되고 눈 상태 신뢰도가 0.80 이상인 상태.
- **Closed_Eye_State**: Valid_Face_State에서 양쪽 눈이 닫힘으로 판정되고 눈 상태 신뢰도가 0.80 이상인 상태.
- **Normal_Blink**: Closed_Eye_State가 1초 미만 지속된 뒤 Open_Eye_State로 전환되는 상태.
- **Eye_Closure_Timer**: Closed_Eye_State의 연속 지속 시간을 측정하는 타이머. 300밀리초 이하의 단일 감지 공백은 연속 상태에 포함하고, 300밀리초를 초과한 감지 공백 또는 Open_Eye_State는 타이머를 0으로 초기화한다.
- **Absence_State**: Operational_Camera에서 얼굴이 감지되지 않는 상태. 얼굴이 감지되지만 Detection_Range만 벗어난 상태는 Absence_State에 포함하지 않는다.
- **Absence_Timer**: Absence_State의 연속 지속 시간을 측정하는 타이머. 얼굴이 0.80 이상의 감지 신뢰도로 다시 감지되면 타이머를 0으로 초기화한다.
- **Unreliable_Detection_State**: 카메라 프레임 분석 속도가 초당 5개 미만이거나 얼굴 또는 눈 상태 신뢰도가 0.80 미만이어서 지속 시간 판정에 사용할 수 없는 상태.
- **Focus_Warning**: Eye_Closure_Timer가 7초에 도달할 때 표시하는 “화면에 집중하세요!” 경고.
- **Absence_Warning**: Absence_Timer가 7초에 도달할 때 표시하는 “화면에서 이탈했습니다.” 경고.
- **Warning_Manager**: 시각 경고, 화면 깜빡임 애니메이션, 알림음, 접근성 대체 수단, 경고 중복 억제를 담당하는 Browser_Client 구성요소.
- **Warning_Episode**: 한 경고가 발생한 시점부터 해당 원인 상태가 해소될 때까지의 기간.
- **Session_Record**: Focus_Session 식별자, 사용자 식별자, 설정 시간, 시작·종료 시각, 종료 사유, 종류별 경고 횟수만 포함하는 데이터. 카메라 프레임과 생체 특징은 포함하지 않는다.
- **Biometric_Data**: 얼굴 이미지, 영상, 얼굴 특징 벡터, 눈 특징 벡터 또는 개인을 식별할 수 있는 시각적 파생 데이터.
- **Accessibility_Mode**: 사용자가 화면 깜빡임 감소, 알림음 음소거, 브라우저 진동 지원 시 진동 사용을 각각 선택할 수 있는 설정.
- **Reduced_Motion_Preference**: 운영체제 또는 브라우저를 통해 전달되는 움직임 감소 사용자 선호.
- **Resource_Release**: 모든 카메라 미디어 트랙 중지, 분석 루프 중지, 타이머 취소, 오디오 중지, 임시 프레임 참조 제거를 포함하는 종료 처리.
- **Traceability_Matrix**: 각 요구사항을 후속 설계 구성요소, 인터페이스, 주 담당자, 검토 담당자, 검증 항목과 연결하는 표.
- **Product_UX_Engineer**: 제품 흐름, 경고 문구, 사용자 경험, 접근성 기준을 담당하는 팀원.
- **Frontend_Session_Engineer**: Browser_Client 화면, Session_Controller, Camera_Controller를 담당하는 팀원.
- **Computer_Vision_Engineer**: Monitoring_Engine, 감지 임계값, 오탐 방지 평가를 담당하는 팀원.
- **Backend_Security_Engineer**: API_Backend, Authentication_Service, 데이터 최소화, API 보안을 담당하는 팀원.
- **QA_Integration_Engineer**: 통합 계약, 브라우저 호환성, 테스트 자동화, 배포 검증을 담당하는 팀원.
- **Team_Plan**: 5인 팀의 산출물, 주 담당 영역, 검토 책임, 인수 조건, 통합 순서를 정의하는 후속 작업 계획.
- **Interface_Contract**: Browser_Client, Monitoring_Engine, API_Backend 사이에 교환되는 입력, 출력, 오류, 버전 규칙의 명세.
- **AI_Assisted_Change**: 생성형 AI 도구를 사용하여 작성하거나 수정한 코드, 테스트, 설정 또는 문서 변경분.

## Requirements

### Requirement 1: 사용자 인증과 세션 접근

**User Story:** 로그인 사용자로서, 인증된 상태에서만 집중 세션을 사용하고 싶다. 그래야 개인별 세션을 안전하게 관리할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 유효한 로그인 정보를 제출하면, THE Authentication_Service SHALL Authenticated_User 상태를 생성한다.
2. IF 사용자가 잘못된 로그인 정보를 제출하면, THEN THE Authentication_Service SHALL 로그인 실패 오류를 반환한다.
3. IF 사용자가 잘못된 로그인 정보를 제출하면, THEN THE Authentication_Service SHALL 인증되지 않은 상태를 유지한다.
4. IF 인증되지 않은 사용자가 Focus_Session 시작을 요청하면, THEN THE API_Backend SHALL 인증 필요 오류를 반환한다.
5. IF 인증되지 않은 사용자가 Focus_Session 시작을 요청하면, THEN THE API_Backend SHALL Focus_Session과 Session_Record를 생성하지 않는다.
6. WHEN Authenticated_User가 로그아웃하면, THE Authentication_Service SHALL Authenticated_User 상태를 무효화한다.
7. WHEN Authenticated_User가 로그아웃하면, THE Session_Controller SHALL 활성 Focus_Session을 종료한다.

### Requirement 2: 집중 시간 설정과 세션 수명주기

**User Story:** Authenticated_User로서, 집중할 시간을 설정하고 세션 진행 상태를 확인하고 싶다. 그래야 정해진 시간 동안 집중할 수 있다.

#### Acceptance Criteria

1. WHEN Authenticated_User가 1 이상 240 이하의 정수 분으로 Session_Duration을 제출하면, THE Session_Controller SHALL Focus_Session을 시작 가능한 상태로 설정한다.
2. IF Authenticated_User가 정수가 아니거나 1 미만 또는 240 초과인 Session_Duration을 제출하면, THEN THE Session_Controller SHALL 허용 범위를 포함한 입력 오류를 표시한다.
3. IF Authenticated_User가 정수가 아니거나 1 미만 또는 240 초과인 Session_Duration을 제출하면, THEN THE Session_Controller SHALL 기존 Session_Duration과 Focus_Session 상태를 유지한다.
4. WHEN Focus_Session이 시작되면, THE Session_Controller SHALL Session_Duration을 초로 환산한 남은 시간을 표시한다.
5. WHILE Focus_Session이 활성 상태이면, THE Session_Controller SHALL 실제 경과 1초마다 남은 시간을 1초씩 감소시킨다.
6. WHILE Focus_Session이 활성 상태이면, THE Session_Controller SHALL 남은 시간을 0초 이상으로 유지한다.
7. WHEN 남은 시간이 0초에 도달하면, THE Session_Controller SHALL Focus_Session을 자동 종료한다.
8. WHEN Authenticated_User가 종료 제어를 선택하면, THE Session_Controller SHALL Focus_Session을 수동 종료한다.
9. IF 동일한 Authenticated_User에게 활성 Focus_Session이 존재하면, THEN THE API_Backend SHALL 추가 Focus_Session 시작 요청을 충돌 응답으로 거절한다.
10. IF 동일한 Authenticated_User에게 활성 Focus_Session이 존재하면, THEN THE API_Backend SHALL 기존 Focus_Session과 Session_Record 상태를 유지한다.

### Requirement 3: 명시적 on/off 감시 제어

**User Story:** Authenticated_User로서, 집중 세션을 사용할 때만 감시 기능을 켜고 싶다. 그래야 카메라 사용 시점을 직접 통제할 수 있다.

#### Acceptance Criteria

1. WHILE Focus_Session이 비활성 상태이면, THE Monitoring_Switch SHALL 꺼짐 상태를 유지한다.
2. WHEN Focus_Session이 활성 상태로 전환되면, THE Monitoring_Switch SHALL 1초 이내에 켜짐 상태로 전환한다.
3. WHEN Focus_Session이 종료되면, THE Monitoring_Switch SHALL 1초 이내에 꺼짐 상태로 전환한다.
4. WHILE Monitoring_Switch가 꺼짐 상태이면, THE Camera_Controller SHALL 신규 카메라 프레임 획득을 중단한 상태를 유지한다.
5. WHILE Monitoring_Switch가 꺼짐 상태이면, THE Monitoring_Engine SHALL 신규 프레임과 분석 대기 중인 프레임을 분석하지 않는다.
6. IF Focus_Session 시작이 실패하면, THEN THE Monitoring_Switch SHALL 꺼짐 상태를 유지한다.
7. IF Focus_Session 시작이 실패하면, THEN THE Browser_Client SHALL 시작 실패 원인을 포함한 오류를 표시한다.

### Requirement 4: 카메라 권한과 브라우저 제약 대응

**User Story:** Authenticated_User로서, 브라우저 제약을 이해하고 명시적으로 카메라 사용을 승인하고 싶다. 그래야 예측 가능한 방식으로 감시 기능을 시작할 수 있다.

#### Acceptance Criteria

1. WHEN Authenticated_User가 Focus_Session 시작 제어를 한 번 선택하면, THE Camera_Controller SHALL 사용자 동작에 연결된 브라우저 카메라 권한 요청을 정확히 한 번 실행한다.
2. WHILE 브라우저 카메라 권한 결정이 완료되지 않은 상태이면, THE Session_Controller SHALL Focus_Session 타이머를 0초로 유지한다.
3. WHEN 브라우저 카메라 권한이 허용되고 Operational_Camera가 확인되면, THE Session_Controller SHALL Focus_Session 타이머를 시작한다.
4. IF 브라우저 카메라 권한이 거부되면, THEN THE Camera_Controller SHALL 브라우저 설정에서 권한을 변경하는 방법을 표시한다.
5. IF 브라우저 카메라 권한이 거부되면, THEN THE Session_Controller SHALL Focus_Session 타이머를 시작하지 않는다.
6. IF 카메라 장치가 없거나 다른 애플리케이션에서 사용 중이면, THEN THE Camera_Controller SHALL 감시를 시작할 수 없다는 장치 오류를 표시한다.
7. IF 카메라 장치가 없거나 다른 애플리케이션에서 사용 중이면, THEN THE Session_Controller SHALL Focus_Session 타이머를 시작하지 않는다.
8. IF 실행 환경이 Supported_Browser 조건을 충족하지 않으면, THEN THE Browser_Client SHALL 필요한 기능과 보안 컨텍스트 조건을 포함한 호환성 안내를 표시한다.
9. IF 실행 환경이 Supported_Browser 조건을 충족하지 않으면, THEN THE Session_Controller SHALL Focus_Session 타이머를 시작하지 않는다.
10. IF 카메라 미디어 트랙이 Focus_Session 도중 종료되면, THEN THE Session_Controller SHALL 경과 시간과 남은 시간을 보존한 일시 정지 상태로 전환한다.
11. WHILE Authenticated_User가 명시적 재개 제어를 선택하지 않은 상태이면, THE Session_Controller SHALL 일시 정지 상태를 유지한다.
12. WHEN Authenticated_User가 명시적 재개 제어를 선택하고 Operational_Camera가 확인되면, THE Session_Controller SHALL 보존한 남은 시간부터 Focus_Session 타이머를 재개한다.

### Requirement 5: 얼굴과 적정 거리 감지

**User Story:** Authenticated_User로서, 카메라가 얼굴과 눈을 판정할 수 있는 위치에 있는지 확인하고 싶다. 그래야 감지 결과의 신뢰도를 유지할 수 있다.

#### Acceptance Criteria

1. WHILE Focus_Session이 활성 상태이고 Operational_Camera가 유지되면, THE Monitoring_Engine SHALL 각 분석 프레임의 얼굴 수를 0개, 1개, 2개 이상으로 구분하여 산출한다.
2. WHILE Focus_Session이 활성 상태이고 Operational_Camera가 유지되면, THE Monitoring_Engine SHALL 각 감지 얼굴의 신뢰도를 0 이상 1 이하의 값으로 산출한다.
3. WHEN 정확히 한 개의 얼굴이 0.80 이상의 감지 신뢰도로 Detection_Range 안에서 감지되면, THE Monitoring_Engine SHALL Valid_Face_State를 생성한다.
4. WHEN 얼굴 수, 얼굴 감지 신뢰도, Detection_Range 또는 Operational_Camera 중 하나가 Valid_Face_State 조건을 충족하지 않으면, THE Monitoring_Engine SHALL Valid_Face_State를 종료한다.
5. WHEN 감지된 얼굴이 Detection_Range를 벗어나면, THE Browser_Client SHALL Positioning_Guidance를 표시한다.
6. WHEN 둘 이상의 얼굴이 0.80 이상의 감지 신뢰도로 감지되면, THE Browser_Client SHALL 한 명만 화면에 위치하도록 Positioning_Guidance를 표시한다.
7. WHEN 정확히 한 개의 얼굴이 0.80 이상의 감지 신뢰도로 Detection_Range 안에 다시 위치하면, THE Browser_Client SHALL 500밀리초 이내에 Positioning_Guidance를 제거한다.
8. WHILE Positioning_Guidance가 표시되는 상태이면, THE Monitoring_Engine SHALL Eye_Closure_Timer의 값을 보존한다.
9. IF 얼굴 감지 신뢰도가 0.80 미만이면, THEN THE Monitoring_Engine SHALL Unreliable_Detection_State를 생성한다.

### Requirement 6: 눈 감김 지속 판정과 오탐 억제

**User Story:** Authenticated_User로서, 정상적인 깜빡임은 허용하면서 장시간 눈 감김만 경고받고 싶다. 그래야 불필요한 경고를 줄일 수 있다.

#### Acceptance Criteria

1. WHILE Valid_Face_State가 유지되면, THE Monitoring_Engine SHALL 각 분석 프레임에서 왼쪽 눈과 오른쪽 눈을 각각 Open 상태 또는 Closed 상태로 산출한다.
2. WHILE Valid_Face_State가 유지되면, THE Monitoring_Engine SHALL 왼쪽 눈과 오른쪽 눈의 신뢰도를 각각 0 이상 1 이하의 값으로 산출한다.
3. IF 왼쪽 눈 또는 오른쪽 눈의 신뢰도가 0.80 미만이면, THEN THE Monitoring_Engine SHALL Unreliable_Detection_State를 생성한다.
4. WHEN Closed_Eye_State의 첫 분석 프레임이 판정되면, THE Monitoring_Engine SHALL 첫 분석 프레임의 판정 시각을 기준으로 Eye_Closure_Timer를 시작한다.
5. WHILE Closed_Eye_State 중 단일 감지 공백이 300밀리초 이하이면, THE Monitoring_Engine SHALL 감지 공백의 실제 경과 시간을 Eye_Closure_Timer에 포함한다.
6. WHEN Open_Eye_State가 감지되면, THE Monitoring_Engine SHALL Eye_Closure_Timer를 0으로 초기화한다.
7. WHEN Normal_Blink가 완료되면, THE Monitoring_Engine SHALL Focus_Warning 발생 횟수를 유지한다.
8. IF Closed_Eye_State 중 단일 감지 공백이 300밀리초를 초과하면, THEN THE Monitoring_Engine SHALL Eye_Closure_Timer를 0으로 초기화한다.
9. IF Closed_Eye_State 중 단일 감지 공백이 300밀리초를 초과하면, THEN THE Monitoring_Engine SHALL 해당 연속 구간의 Focus_Warning 발생 신호를 생성하지 않는다.
10. WHEN Eye_Closure_Timer가 7초에 도달하면, THE Monitoring_Engine SHALL 500밀리초 이내에 Warning_Episode당 한 번의 Focus_Warning 발생 신호를 생성한다.
11. WHILE Unreliable_Detection_State가 유지되면, THE Monitoring_Engine SHALL Eye_Closure_Timer의 값을 보존한다.

### Requirement 7: 화면 이탈 지속 판정과 오탐 억제

**User Story:** Authenticated_User로서, 카메라 화면에서 일정 시간 벗어났을 때 경고받고 싶다. 그래야 화면 이탈을 인지할 수 있다.

#### Acceptance Criteria

1. WHEN Absence_State의 첫 분석 프레임이 판정되면, THE Monitoring_Engine SHALL 첫 분석 프레임의 판정 시각을 기준으로 Absence_Timer를 시작한다.
2. WHILE Absence_State가 유지되면, THE Monitoring_Engine SHALL 실제 경과 시간 대비 ±100밀리초 이내의 오차로 Absence_Timer를 갱신한다.
3. WHEN 얼굴이 0.80 이상의 감지 신뢰도로 다시 감지되면, THE Monitoring_Engine SHALL 500밀리초 이내에 Absence_Timer를 0으로 초기화한다.
4. WHILE 얼굴이 감지되고 Detection_Range만 벗어난 상태이면, THE Monitoring_Engine SHALL Absence_Timer의 값을 보존한다.
5. WHEN Detection_Range를 벗어난 얼굴이 다시 사라져 Absence_State가 재개되면, THE Monitoring_Engine SHALL 보존한 Absence_Timer 값부터 측정을 재개한다.
6. WHILE Unreliable_Detection_State가 유지되면, THE Monitoring_Engine SHALL Absence_Timer의 값을 보존한다.
7. WHEN Unreliable_Detection_State가 해소되고 Absence_State가 다시 확인되면, THE Monitoring_Engine SHALL 보존한 Absence_Timer 값부터 측정을 재개한다.
8. WHEN Absence_Timer가 7초에 도달하면, THE Monitoring_Engine SHALL 500밀리초 이내에 Warning_Episode당 한 번의 Absence_Warning 발생 신호를 생성한다.
9. IF 카메라 프레임 공급이 1초 동안 연속 중단되면, THEN THE Monitoring_Engine SHALL Absence_Timer를 0으로 초기화한다.

### Requirement 8: 경고 표시와 중복 억제

**User Story:** Authenticated_User로서, 집중 저하 또는 화면 이탈을 즉시 알아차릴 수 있는 경고를 받고 싶다. 그래야 집중 상태로 돌아갈 수 있다.

#### Acceptance Criteria

1. WHEN Focus_Warning 발생 신호를 수신하면, THE Warning_Manager SHALL 500밀리초 이내에 “화면에 집중하세요!” 문구를 표시한다.
2. WHEN Absence_Warning 발생 신호를 수신하면, THE Warning_Manager SHALL 500밀리초 이내에 “화면에서 이탈했습니다.” 문구를 표시한다.
3. WHEN 경고 발생 신호를 수신하고 Reduced_Motion_Preference와 Accessibility_Mode의 화면 깜빡임 감소가 모두 비활성화되어 있으면, THE Warning_Manager SHALL 500밀리초 이내에 화면 깜빡임 애니메이션을 시작한다.
4. WHEN 경고 발생 신호를 수신하고 알림음이 활성화되어 있으면, THE Warning_Manager SHALL 500밀리초 이내에 Warning_Episode당 한 번의 알림음을 재생한다.
5. WHILE 동일한 Warning_Episode가 유지되면, THE Warning_Manager SHALL 동일 종류의 추가 경고 문구, 시각 효과, 알림음 발생을 억제한다.
6. WHEN 경고 원인 상태가 해소되면, THE Warning_Manager SHALL 500밀리초 이내에 활성 경고 문구와 시각 효과를 제거한다.
7. WHEN 경고 원인 상태가 해소된 뒤 같은 원인 상태가 다시 7초 동안 지속되면, THE Warning_Manager SHALL 새로운 Warning_Episode를 시작한다.

### Requirement 9: 접근 가능한 경고와 제어

**User Story:** 다양한 감각 및 운동 능력을 가진 Authenticated_User로서, 경고와 제어를 접근 가능한 방식으로 사용하고 싶다. 그래야 시각 또는 청각 효과에만 의존하지 않고 서비스를 사용할 수 있다.

#### Acceptance Criteria

1. THE Browser_Client SHALL 키보드만으로 Focus_Session 설정, 시작, 종료, Accessibility_Mode 변경을 수행할 수 있는 제어를 제공한다.
2. WHEN 키보드 포커스가 대화형 제어로 이동하면, THE Browser_Client SHALL 포커스가 위치한 제어를 시각적으로 식별할 수 있는 표시를 제공한다.
3. THE Browser_Client SHALL 일반 텍스트에 4.5:1 이상의 명암비를 적용한다.
4. THE Browser_Client SHALL 큰 텍스트와 대화형 제어의 시각적 경계에 3:1 이상의 명암비를 적용한다.
5. WHEN 경고 문구가 표시되면, THE Warning_Manager SHALL 1초 이내에 Warning_Episode당 한 번의 보조 기술용 긴급 상태 알림을 제공한다.
6. WHEN 보조 기술용 긴급 상태 알림이 제공되면, THE Warning_Manager SHALL 현재 키보드 포커스 위치를 유지한다.
7. WHEN Reduced_Motion_Preference가 활성화되어 있으면, THE Warning_Manager SHALL 화면 깜빡임 대신 인접 배경과 3:1 이상의 명암비를 갖는 정적 고대비 테두리 경고를 표시한다.
8. WHERE Accessibility_Mode의 화면 깜빡임 감소가 활성화되어 있으면, THE Warning_Manager SHALL 화면 깜빡임 대신 인접 배경과 3:1 이상의 명암비를 갖는 정적 고대비 테두리 경고를 표시한다.
9. WHERE Accessibility_Mode의 알림음 음소거가 활성화되어 있으면, THE Warning_Manager SHALL 시각 경고와 보조 기술 알림만 제공한다.
10. WHERE Accessibility_Mode의 진동 사용이 활성화되어 있고 Supported_Browser가 진동을 지원하면, THE Warning_Manager SHALL Warning_Episode당 한 번의 200밀리초 진동 신호를 제공한다.
11. WHEN 카메라 사용 상태 또는 Monitoring_Switch 상태가 변경되면, THE Browser_Client SHALL 1초 이내에 변경된 상태를 색상 외의 텍스트로 표시한다.

### Requirement 10: 개인정보 보호와 영상 처리 경계

**User Story:** Authenticated_User로서, 카메라 영상과 생체 정보가 기기 밖으로 전송되지 않기를 원한다. 그래야 집중 감시 기능을 개인정보 노출 없이 사용할 수 있다.

#### Acceptance Criteria

1. WHILE Focus_Session이 활성 상태이면, THE Monitoring_Engine SHALL 카메라 프레임 분석을 Browser_Client 안에서 수행한다.
2. THE Browser_Client SHALL 카메라 영상과 카메라 프레임을 외부 네트워크 대상으로 전송하지 않는다.
3. THE Browser_Client SHALL Biometric_Data를 외부 네트워크 대상으로 전송하지 않는다.
4. THE Browser_Client SHALL 카메라 영상, 카메라 프레임, Biometric_Data를 영구 저장소에 기록하지 않는다.
5. WHEN Focus_Session이 종료되면, THE Browser_Client SHALL 2초 이내에 메모리에 남은 카메라 영상, 카메라 프레임, Biometric_Data 참조를 제거한다.
6. WHEN 카메라 권한을 요청하기 전에, THE Browser_Client SHALL 카메라 사용 목적, Browser_Client 내부 처리 위치, Focus_Session 동안의 사용 기간, 카메라 영상·카메라 프레임·Biometric_Data의 비저장 및 비전송 방침을 표시한다.
7. THE API_Backend SHALL Session_Record에 정의된 필드만 세션 데이터로 수신한다.
8. IF 세션 데이터 요청에 Session_Record에 정의되지 않은 필드가 하나 이상 포함되면, THEN THE API_Backend SHALL 요청 전체를 거절한다.
9. IF Authenticated_User가 다른 사용자의 Session_Record를 요청하면, THEN THE API_Backend SHALL 존재하지 않는 Session_Record 요청과 구분되지 않는 응답을 반환한다.
10. THE API_Backend SHALL HTTPS 연결을 통한 인증 및 Session_Record 요청만 허용한다.
11. IF 인증 또는 Session_Record 요청이 HTTPS 연결을 사용하지 않으면, THEN THE API_Backend SHALL 요청을 처리하기 전에 거절한다.

### Requirement 11: 세션 기록과 FastAPI 백엔드 계약

**User Story:** Authenticated_User로서, 집중 세션의 시작과 종료가 일관되게 기록되기를 원한다. 그래야 세션 상태를 신뢰할 수 있다.

#### Acceptance Criteria

1. THE API_Backend SHALL Python FastAPI 기반의 인증 및 Focus_Session API를 제공한다.
2. WHEN API_Backend가 인증 또는 Focus_Session 요청을 수신하면, THE API_Backend SHALL 10초 이내에 성공 또는 오류 결과를 반환한다.
3. WHEN Session_Controller가 유효한 Focus_Session 시작을 확정하면, THE API_Backend SHALL 새로운 Session_Record를 활성 상태로 정확히 한 번 생성한다.
4. IF Focus_Session 시작 요청이 유효하지 않으면, THEN THE API_Backend SHALL 기존 Session_Record를 변경하지 않는다.
5. WHEN Session_Controller가 활성 Focus_Session 종료를 통지하면, THE API_Backend SHALL Session_Record에 종료 시각과 종료 사유를 정확히 한 번 기록한다.
6. IF Focus_Session 종료 요청이 유효하지 않으면, THEN THE API_Backend SHALL 기존 Session_Record를 변경하지 않는다.
7. WHEN Warning_Manager가 새로운 Warning_Episode를 시작하면, THE API_Backend SHALL Session_Record의 대응하는 경고 종류 횟수를 정확히 1 증가시킨다.
8. IF 경고 횟수 변경 요청이 유효하지 않으면, THEN THE API_Backend SHALL 기존 Session_Record를 변경하지 않는다.
9. IF API_Backend 통신이 Focus_Session 도중 실패하면, THEN THE Browser_Client SHALL 1초 이내에 카메라 감시의 현재 동작 상태와 기록 동기화 실패 상태를 구분하여 표시한다.
10. WHEN API_Backend 통신이 복구되면, THE Browser_Client SHALL 5초 이내에 동일한 Focus_Session 식별자의 미전송 Session_Record 변경분을 생성 순서대로 최대 100건씩 묶어 동기화를 요청한다.
11. WHILE API_Backend의 적용 확인을 받지 못한 Session_Record 변경분이 존재하면, THE Browser_Client SHALL 미확인 변경분을 동기화 대기 상태로 유지한다.
12. IF 동일한 Session_Record 변경분이 중복 제출되면, THEN THE API_Backend SHALL 최초 적용 결과와 동일한 Session_Record를 반환한다.
13. IF 동일한 Session_Record 변경분이 중복 제출되면, THEN THE API_Backend SHALL Session_Record에 추가 변경을 적용하지 않는다.
14. IF 인증되지 않은 사용자가 Session_Record 변경을 요청하면, THEN THE API_Backend SHALL Session_Record를 변경하지 않는다.

### Requirement 12: 자원 해제와 예외 종료

**User Story:** Authenticated_User로서, 집중 세션이 끝난 뒤 카메라와 관련 자원이 즉시 해제되기를 원한다. 그래야 세션 외 시간에 카메라가 동작하지 않는다.

#### Acceptance Criteria

1. WHEN Focus_Session이 수동 종료되면, THE Camera_Controller SHALL 2초 이내에 Resource_Release를 완료한다.
2. WHEN Session_Duration 만료로 Focus_Session이 종료되면, THE Camera_Controller SHALL 2초 이내에 Resource_Release를 완료한다.
3. WHEN Authenticated_User가 로그아웃하면, THE Camera_Controller SHALL 2초 이내에 Resource_Release를 완료한다.
4. WHEN Browser_Client가 페이지 종료 이벤트를 수신하면, THE Camera_Controller SHALL 100밀리초 이내에 Resource_Release를 요청한다.
5. IF Monitoring_Engine에서 복구 불가능한 분석 오류가 발생하면, THEN THE Session_Controller SHALL 2초 이내에 Focus_Session을 종료 상태로 전환한다.
6. IF Monitoring_Engine에서 복구 불가능한 분석 오류가 발생하면, THEN THE Camera_Controller SHALL 2초 이내에 Resource_Release를 완료한다.
7. IF Resource_Release의 일부 작업이 실패하면, THEN THE Camera_Controller SHALL 실패한 자원 종류만 진단 로그에 기록한다.
8. IF Resource_Release의 일부 작업이 실패하면, THEN THE Camera_Controller SHALL 진단 로그에서 사용자 개인 데이터, 카메라 영상, 카메라 프레임, Biometric_Data를 제외한다.
9. WHILE Focus_Session이 종료 상태이면, THE Camera_Controller SHALL 카메라 장치와 카메라 프레임에 접근하지 않는다.
10. WHILE Focus_Session이 종료 상태이면, THE Browser_Client SHALL 카메라 사용 표시를 비활성 상태로 표시한다.

### Requirement 13: 감지 품질 검증과 진단

**User Story:** 팀 구성원으로서, 실제 사용 조건에서 감지 품질과 오탐 원인을 측정하고 싶다. 그래야 경고 기준을 검증 가능한 근거로 조정할 수 있다.

#### Acceptance Criteria

1. THE Monitoring_Engine SHALL 조명 밝기 100럭스 이상 1,000럭스 이하의 시험 조건에서 왼쪽 눈과 오른쪽 눈의 Open 상태 또는 Closed 상태와 각각의 0 이상 1 이하 신뢰도를 출력하는 검증 인터페이스를 제공한다.
2. THE QA_Integration_Engineer SHALL 검증 실행 전에 조명 밝기 100럭스 이상 1,000럭스 이하의 시험 범위를 복수의 조명 구간으로 정의한다.
3. THE QA_Integration_Engineer SHALL 안경 미착용 조건과 일반 투명 안경 착용 조건을 각 조명 구간에서 독립적으로 평가한다.
4. THE QA_Integration_Engineer SHALL 감지 임계값 조정에 사용하지 않은 사전 라벨링 검증 데이터만 감지 품질 평가에 사용한다.
5. THE QA_Integration_Engineer SHALL 각 안경 착용 여부와 조명 구간 조합의 Normal_Blink 사례 100건에서 Focus_Warning 오탐이 1건 이하인지 검증한다.
6. THE QA_Integration_Engineer SHALL 각 안경 착용 여부와 조명 구간 조합의 7초 이상 Closed_Eye_State 사례 100건에서 Focus_Warning 탐지가 95건 이상인지 검증한다.
7. THE QA_Integration_Engineer SHALL 각 안경 착용 여부와 조명 구간 조합의 7초 이상 Absence_State 사례 100건에서 Absence_Warning 탐지가 95건 이상인지 검증한다.
8. THE Focus_Monitoring_Web_App SHALL 진단 로그에서 카메라 영상, 카메라 프레임, Biometric_Data를 제외한다.
9. WHEN Unreliable_Detection_State가 2초 동안 지속되면, THE Browser_Client SHALL 500밀리초 이내에 조명, 카메라 위치, 브라우저 성능을 확인하라는 안내를 표시한다.
10. WHEN Unreliable_Detection_State가 해소되면, THE Browser_Client SHALL 500밀리초 이내에 불신 상태 안내를 제거한다.
11. WHEN Focus_Warning 또는 Absence_Warning 진단 정보를 기록하면, THE Focus_Monitoring_Web_App SHALL 경고 원인 상태별 누적 시간만 기록한다.

### Requirement 14: 5인 팀 역할과 협업 경계

**User Story:** 5인 개발팀 구성원으로서, 각자의 주 책임과 검토 경계를 명확히 알고 싶다. 그래야 AI 바이브코딩 과정에서도 중복 작업과 통합 누락을 줄일 수 있다.

#### Acceptance Criteria

1. THE Team_Plan SHALL Product_UX_Engineer에게 사용자 흐름, 경고 문구, Accessibility_Mode, 개인정보 고지의 주 책임을 배정한다.
2. THE Team_Plan SHALL Frontend_Session_Engineer에게 Browser_Client, Session_Controller, Camera_Controller, Resource_Release의 주 책임을 배정한다.
3. THE Team_Plan SHALL Computer_Vision_Engineer에게 Monitoring_Engine, Detection_Range, 눈 감김 판정, 화면 이탈 판정, 오탐 억제의 주 책임을 배정한다.
4. THE Team_Plan SHALL Backend_Security_Engineer에게 Python FastAPI 기반 API_Backend, Authentication_Service, Session_Record, 권한 검사의 주 책임을 배정한다.
5. THE Team_Plan SHALL QA_Integration_Engineer에게 Interface_Contract 검증, Supported_Browser 호환성, 접근성 검증, 통합 테스트, 배포 검증의 주 책임을 배정한다.
6. THE Team_Plan SHALL 각 요구사항에 정확히 한 명의 주 담당자를 지정한다.
7. THE Team_Plan SHALL 각 요구사항에 주 담당자와 다른 한 명 이상의 검토 담당자를 지정한다.
8. WHEN Browser_Client와 Monitoring_Engine 사이의 Interface_Contract가 변경되면, THE Team_Plan SHALL Frontend_Session_Engineer와 Computer_Vision_Engineer 모두의 기록된 승인을 요구한다.
9. WHEN Browser_Client와 API_Backend 사이의 Interface_Contract가 변경되면, THE Team_Plan SHALL Frontend_Session_Engineer와 Backend_Security_Engineer 모두의 기록된 승인을 요구한다.
10. WHEN 경고 표현 또는 Accessibility_Mode가 변경되면, THE Team_Plan SHALL Product_UX_Engineer와 QA_Integration_Engineer 모두의 기록된 승인을 요구한다.
11. WHEN 감지 임계값이 변경되면, THE Team_Plan SHALL Computer_Vision_Engineer와 QA_Integration_Engineer 모두의 검증 근거가 포함된 기록된 승인을 요구한다.
12. WHEN 개인정보 처리 경계가 변경되면, THE Team_Plan SHALL Backend_Security_Engineer와 Product_UX_Engineer 모두의 기록된 승인을 요구한다.
13. THE Team_Plan SHALL 각 구성요소의 식별 가능한 산출물을 정의한다.
14. THE Team_Plan SHALL 각 구성요소의 선행 작업을 정의한다.
15. THE Team_Plan SHALL 각 구성요소의 객관적으로 검증 가능한 인수 조건을 정의한다.
16. THE Team_Plan SHALL 각 구성요소의 통합 순서를 정의한다.

### Requirement 15: 후속 설계 추적성과 AI 보조 개발 통제

**User Story:** 5인 개발팀 구성원으로서, 요구사항과 설계, 구현, 검증의 연결을 유지하고 싶다. 그래야 AI가 생성한 변경분도 책임 있게 검토할 수 있다.

#### Acceptance Criteria

1. THE Traceability_Matrix SHALL 각 요구사항을 고유 식별자가 있는 후속 설계 구성요소와 연결한다.
2. THE Traceability_Matrix SHALL 각 요구사항을 고유 식별자가 있는 Interface_Contract와 연결한다.
3. THE Traceability_Matrix SHALL 각 요구사항을 Team_Plan의 식별 가능한 주 담당자와 검토 담당자에게 연결한다.
4. THE Traceability_Matrix SHALL 각 요구사항을 고유 식별자가 있는 하나 이상의 검증 항목과 연결한다.
5. WHEN AI_Assisted_Change가 병합 후보가 되면, THE Team_Plan SHALL 병합 전에 변경 영역 주 담당자가 요구사항 추적 링크를 기록하도록 지정한다.
6. WHEN AI_Assisted_Change가 병합 후보가 되면, THE Team_Plan SHALL 병합 전에 변경 영역 검토 담당자가 Interface_Contract 준수 근거를 기록하도록 지정한다.
7. WHEN AI_Assisted_Change가 병합 후보가 되면, THE Team_Plan SHALL 병합 전에 QA_Integration_Engineer가 관련 자동 검증 결과를 기록하도록 지정한다.
8. IF AI_Assisted_Change가 Biometric_Data 처리 경계를 변경하면, THEN THE Team_Plan SHALL Backend_Security_Engineer의 기록된 승인 전까지 변경분을 병합 대기 상태로 유지하도록 지정한다.
9. IF AI_Assisted_Change에 요구사항 추적 링크가 누락되면, THEN THE Team_Plan SHALL 변경분을 병합 대기 상태로 유지하도록 지정한다.
10. IF AI_Assisted_Change가 Interface_Contract를 준수하지 않으면, THEN THE Team_Plan SHALL 변경분을 병합 대기 상태로 유지하도록 지정한다.
11. IF AI_Assisted_Change의 관련 자동 검증이 실패하면, THEN THE Team_Plan SHALL 변경분을 병합 대기 상태로 유지하도록 지정한다.
