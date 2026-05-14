# UConfigTool

## 操作演示

<video controls preload="metadata" width="100%">
  <source src="docs/media/operation-demo.mp4" type="video/mp4" />
  您的浏览器不支持 video 标签，可使用下方链接下载查看。
</video>

无法直接播放时可下载： [operation-demo.mp4](docs/media/operation-demo.mp4)


`UConfigTool` 鏄竴涓熀浜?`Electron + React + TypeScript` 鐨勫紑婧愰厤缃伐鍏凤紝闈㈠悜娓告垙/瀹㈡埛绔?鏈嶅姟绔」鐩腑鐨勯厤缃紪杈戜笌浠ｇ爜鐢熸垚鍦烘櫙銆?
鏈」鐩€傚悎浣滀负鍏紑浠撳簱闀挎湡缁存姢锛屾敮鎸佸彲瑙嗗寲閰嶇疆绠＄悊銆丣SON 瀵煎嚭銆佸璇█绫诲瀷浠ｇ爜瀵煎嚭锛屼互鍙?Windows 瀹夎鍖呭垎鍙戙€?
## 鍔熻兘鐗规€?
- 鍙鍖栫鐞嗛厤缃被鍨嬩笌閰嶇疆琛?- 鏀寔閰嶇疆瀛楁瀹氫箟锛堝熀纭€绫诲瀷銆佹暟缁勩€佸祵濂楃被鍨嬶級
- 鏀寔閰嶇疆琛ㄥ唴瀹圭紪杈戜笌淇濆瓨
- 閰嶇疆瀵煎嚭
- 閫夋嫨閰嶇疆绫诲瀷瀵煎嚭 JSON
- 閫夋嫨缂栫▼璇█瀵煎嚭绫诲瀷浠ｇ爜
- 宸叉敮鎸佸鍑鸿瑷€锛?- `C#`
- `Lua`
- `TypeScript`
- `Python`
- `Java`
- `Go`
- `C++`
- `Rust`
- 妗岄潰绔伐绋嬪寲鑳藉姏
- 涓昏繘绋?娓叉煋杩涚▼/鍏变韩灞傚垎灞?- 绫诲瀷鍖?IPC 閫氫俊妯″瀷
- 鍙墦鍖?Windows 瀹夎鍖咃紙NSIS锛?
## 杩愯鐜

- Node.js 18+
- npm 9+
- Windows锛堝綋鍓嶄富瑕佹墦鍖呯洰鏍囷級

## 蹇€熷紑濮?
```bash
npm install
npm run dev
```

## 甯哥敤鍛戒护

- `npm run dev`锛氬惎鍔ㄥ紑鍙戠幆澧冿紙Vite + Electron锛?- `npm run build`锛氭瀯寤烘覆鏌撳眰
- `npm run build:electron`锛氱紪璇戜富杩涚▼涓?preload
- `npm run typecheck`锛氱被鍨嬫鏌?- `npm run test`锛氳繍琛屾祴璇?- `npm run check:all`锛氬畬鏁磋川閲忛棬绂佹鏌?- `npm run dist:win`锛氭墦鍖?Windows 瀹夎鍖?
## 鎵撳寘鍙戝竷锛圵indows锛?
```bash
npm run dist:win
```

瀹夎鍖呰緭鍑虹洰褰曪細

- `release/`

榛樿瀹夎鍖呮枃浠跺悕绀轰緥锛?
- `UConfigTool Setup 1.0.0.exe`

## 瀵煎嚭鐩綍缁撴瀯锛堢ず渚嬶級

褰撳湪搴旂敤涓墽琛屽鍑哄悗锛岀洰鏍囩洰褰曚笅榛樿浼氱敓鎴愶細

- `绫诲瀷鏂囦欢澶?`锛氭寜鎵€閫夎瑷€杈撳嚭绫诲瀷浠ｇ爜
- `閰嶇疆琛ㄦ枃浠跺す/`锛氭寜鎵€閫夐厤缃被鍨嬭緭鍑?JSON 閰嶇疆琛?
## 椤圭洰缁撴瀯锛堢畝瑕侊級

- `src/renderer/`锛氭覆鏌撳眰鐣岄潰涓庝氦浜掗€昏緫
- `electron/main/`锛氫富杩涚▼锛堢獥鍙ｃ€両PC銆侀厤缃瓨鍌ㄣ€佸鍑烘湇鍔★級
- `electron/preload/`锛氬畨鍏ㄦˉ鎺?API锛坄window.appApi`锛?- `shared/`锛氫富/娓叉煋鍏变韩绫诲瀷涓庡崗璁?- `docs/`锛氭灦鏋勩€佽鑼冦€佸彂甯冩枃妗?
## 鏂囨。绱㈠紩

- [鏋舵瀯璇存槑](docs/ARCHITECTURE.md)
- [寮€鍙戠害瀹歖(docs/CONVENTIONS.md)
- [涓婃墜鎸囧崡](docs/ONBOARDING.md)
- [鍙戝竷璇存槑](docs/RELEASE.md)
- [椤圭洰缁撴瀯](PROJECT_STRUCTURE.md)
- [璇︾粏缁撴瀯璇存槑](docs/PROJECT_STRUCTURE_DETAILED.md)

## 寮€婧愮淮鎶ゅ缓璁?
寤鸿鍦?Gitee 浠撳簱涓ˉ鍏呬互涓嬪唴瀹癸紝渚夸簬鍏紑鍗忎綔锛?
- `LICENSE`锛堟帹鑽?MIT锛?- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`锛堝彲閫夛級
- Issue / PR 妯℃澘锛堝彲閫夛級

## 璐＄尞鏂瑰紡

娆㈣繋鎻愪氦 Issue 鍜?Pull Request锛?
1. Fork 浠撳簱骞跺垱寤哄姛鑳藉垎鏀?2. 瀹屾垚寮€鍙戝苟閫氳繃鏈湴妫€鏌ワ紙`npm run check:all`锛?3. 鎻愪氦 PR锛岃鏄庡彉鏇寸洰鐨勪笌褰卞搷鑼冨洿

## 鍏嶈矗澹版槑

鏈」鐩寜鈥滅幇鐘垛€濇彁渚涳紝浣跨敤鑰呴渶鏍规嵁鑷韩涓氬姟鍦烘櫙杩涜楠岃瘉涓庨€傞厤銆?
