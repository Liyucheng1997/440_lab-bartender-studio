# 调酒教室

在浏览器里跟着 3D 调酒师学调酒。写实人物模型按真实酒谱演示 11 款经典鸡尾酒，覆盖摇和、调和、直调、捣压、渐层五种技法。

- 酒谱参照 IBA 标准配方，每一步附带“为什么这样做”的讲解
- 完整动作：取杯、蘸盐边、加冰、量酒、抖苦精、摇和、搅拌、捣压、滤冰、装饰、出品
- 液面按杯型和冰块排水计算，颜色按原料混合，做完给出容量与酒精度
- 连续演示 / 逐步学习、0.5×–2× 变速、暂停、音效

## 运行

```bash
npm install
npm run dev
```

打开 http://localhost:5440 。

## 技术

Vite + Three.js。手臂为两段 IK，手指、头部、眨眼和微笑由骨骼驱动；杯具与酒液为程序化建模。

## 素材授权

调酒师模型来自 [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox)（MIT），说明见 `public/models/bartender/LICENSE.txt`。
