# 大模型训练之旅

`training.js` 是完整的场景内容稿：定义三维计算大厅、PBR 材质、中文空间标牌、镜头和绝对时间动画。保存到文章的 `:::scene3d` 后由通用播放器渲染，没有训练案例专用的前端组件。

## 镜头与语义

| 场景时间 | 镜头 | 画面 |
| --- | --- | --- |
| 0–6 秒 | 总览 | 计算大厅、语料、模型层、输出区域 |
| 6–14 秒 | 词元与目标 | 示例“春天 / 的 / 天空 / 很”，下一词目标为“蓝” |
| 14–22 秒 | 向量与位置 | 四组向量从数据台升起，表示查表后的数值特征 |
| 22–32 秒 | 因果注意力 | 下三角区域亮起，上三角未来位置屏蔽 |
| 32–40 秒 | 前向计算与 GPU 硬件 | 参数矩阵依次发光；镜头靠近 Blender GPU 样机，外壳、散热器抬升露出芯片，再复原 |
| 40–48 秒 | 预测与损失 | 四项词表概率为 0.20、0.35、0.25、0.20，目标损失 −ln(0.20) ≈ 1.609 |
| 48–57 秒 | 反向传播 | 橙色梯度从输出返回模型，并通过支路进入各层 |
| 57–66 秒 | 参数更新 | 示意参数厚度改变，优化后概率示意变为 0.46、0.23、0.18、0.13 |
| 66–74 秒 | 推理生成 | 参数固定，绿色前向信号生成下一个词元，显示完整示例句子 |

工坊会按实际配音长度伸长各镜头，场景姿态保持一致。预览不含配音，成片包含中文系统配音与独立 SRT。

## 表达边界

- 展示 decoder-only 自回归语言模型的训练概念。四个词元、四层、八乘五参数块都是缩小示意；没有运行真实 tokenizer、Transformer 或 GPU 训练。
- GPU 样机是 Blender 建模的计算硬件，参数矩阵是神经网络的抽象表示；拆解动作展示硬件结构，不代表训练时硬件会拆开。
- 词元不必等于词，这里为方便阅读使用词级划分。真实训练通常在多个位置计算下一词元损失；画面只聚焦最后一个位置。
- 注意力遮罩包含对角线，不允许看到未来；亮度只表示允许访问，不表示真实注意力权重。
- 图中只概括注意力、前馈网络、残差与归一化，没有完整展开 Q/K/V、多头拼接或归一化位置。
- 橙色表示梯度，蓝色表示前向表示；梯度不是输入倒放。用 SGD 公式讲清参数更新，不假定真实大模型只使用 SGD。
- 优化后的概率是手工设定的教学例子，不是由这些几何块计算出的训练结果；真实损失不保证逐步单调下降。
- 推理过程中参数保持不变。本片不展示分布式通信、优化器状态、混合精度、微调或偏好训练。

原理核对：[Attention Is All You Need](https://arxiv.org/abs/1706.03762)；[PyTorch CrossEntropyLoss](https://docs.pytorch.org/docs/stable/generated/torch.nn.CrossEntropyLoss.html)。

## 内容与资源

- `training.js`：材质、设备、镜头、动作与示例数值。
- `training-labels.json`：中文标牌的标题、副文案；导入时通过 `scripts/3d-lab-labels.ts` 渲染成普通 PNG 并上传隔离媒体库。
- `examples/assets/gpu/gpu-module.glb`：Blender 导出的 GPU 网格、物理材质与 `GPU_Explode` 动画；源文件为同目录的 `gpu-module.blend`。场景通过普通 `model` 节点引用，`animationTime` 轨道控制拆解进度。
- `__LLM_…__`、`__FLOOR_…__` 等占位符仅供种子脚本绑定资源，最终正文全部保存真实 `/media/...` 地址。通用播放器不识别这些占位符。
- 贴图复用已登记来源的 `examples/assets/materials`，无需外部网络加载。

当前网页已包含 GPU 模型。之前导出的 `.lab/outputs/llm-training-3d.mp4` 是加入模型之前的版本，需重新同步工坊、生成配音并导出，才会包含新增镜头。

```sh
pnpm exec tsx scripts/seed-3d-lab.ts training
pnpm exec tsx scripts/voice-3d-lab.ts training
cp .lab/voice-assets/* .lab/native-studio/voice-assets/
pnpm exec tsx scripts/render-3d-lab.ts training --native
```

种子脚本直接写隔离数据库；本地 Next 服务已经缓存同名文章时，需要重启本地开发服务后再生成配音。日常通过后台保存正文会正常刷新缓存，无需重启。已有工坊项目更新后使用 `--sync`。

预览：<http://localhost:3431/posts/llm-training-3d-lab/present>。空格暂停/继续，R 重播，F 进入浏览器全屏。
