/**
 * 正式 Cocos 序列化资源校验清单。
 *
 * 新增正式 Scene 或 Prefab 时必须在这里登记。每项脚本配置都同时关联源码、ccclass、
 * 宿主节点和 Inspector 必填绑定，未登记的序列化资源会直接导致校验失败。
 */
export const cocosAssetManifest = [
  {
    kind: "scene",
    assetPath: "assets/scene/Boot.scene",
    scripts: [
      {
        className: "BootScene",
        sourcePath: "assets/app/scenes/BootScene.ts",
        hostNodeName: "Canvas",
      },
    ],
    checks: ["noCanvasAudio"],
  },
  {
    kind: "scene",
    assetPath: "assets/scene/Lobby.scene",
    scripts: [
      {
        className: "LobbyScene",
        sourcePath: "assets/app/scenes/LobbyScene.ts",
        hostNodeName: "Canvas",
        objectBindings: {
          uiRoot: { type: "cc.Node", nodeName: "UIRoot" },
        },
      },
    ],
    checks: ["noCanvasAudio"],
  },
  {
    kind: "scene",
    assetPath: "assets/scene/Game.scene",
    scripts: [
      {
        className: "GameScene",
        sourcePath: "assets/app/scenes/GameScene.ts",
        hostNodeName: "Canvas",
        objectBindings: {
          uiRoot: { type: "cc.Node", nodeName: "UIRoot" },
        },
      },
    ],
    checks: ["noCanvasAudio"],
  },
  {
    kind: "prefab",
    assetPath: "assets/resources/prefabs/common/UILoadErrorPanel.prefab",
    scripts: [
      {
        className: "UILoadErrorPanel",
        sourcePath: "assets/app/ui/common/UILoadErrorPanel.ts",
        hostNodeName: "UILoadErrorPanel",
        objectBindings: {
          overlayGraphics: { type: "cc.Graphics", nodeName: "UILoadErrorPanel" },
          panelGraphics: { type: "cc.Graphics", nodeName: "Panel" },
          titleLabel: { type: "cc.Label", nodeName: "TitleLabel" },
          messageLabel: { type: "cc.Label", nodeName: "MessageLabel" },
          retryButton: { type: "cc.Button", nodeName: "RetryButton" },
          retryButtonGraphics: { type: "cc.Graphics", nodeName: "RetryButton" },
          retryButtonLabel: { type: "cc.Label", nodeName: "Label" },
          backButton: { type: "cc.Button", nodeName: "BackButton" },
          backButtonGraphics: { type: "cc.Graphics", nodeName: "BackButton" },
          backButtonLabel: { type: "cc.Label", nodeName: "Label" },
        },
      },
    ],
  },
  {
    kind: "prefab",
    assetPath: "assets/resources/prefabs/game/PuzzlePiece.prefab",
    scripts: [
      {
        className: "PuzzlePiece",
        sourcePath: "assets/app/ui/game/PuzzlePiece.ts",
        hostNodeName: "PuzzlePiece",
        objectBindings: {
          pieceTransform: { type: "cc.UITransform", nodeName: "PuzzlePiece" },
          imageSprite: { type: "cc.Sprite", nodeName: "PuzzlePiece" },
          numberLabel: { type: "cc.Label", nodeName: "NumberLabel" },
        },
      },
    ],
  },
  {
    kind: "prefab",
    assetPath: "assets/resources/prefabs/game/UIGamePanel.prefab",
    scripts: [
      {
        className: "UIGamePanel",
        sourcePath: "assets/app/ui/game/UIGamePanel.ts",
        hostNodeName: "UIGamePanel",
        objectBindings: {
          titleLabel: { type: "cc.Label", nodeName: "TitleLabel" },
          progressLabel: { type: "cc.Label", nodeName: "ProgressLabel" },
          feedbackLabel: { type: "cc.Label", nodeName: "FeedbackLabel" },
          puzzleContainer: { type: "cc.Node", nodeName: "PuzzleContainer" },
          puzzleContainerTransform: {
            type: "cc.UITransform",
            nodeName: "PuzzleContainer",
          },
          restingGroupBorderGraphics: {
            type: "cc.Graphics",
            nodeName: "RestingGroupBorderLayer",
          },
          activeGroupRoot: { type: "cc.Node", nodeName: "ActiveGroupRoot" },
          activePieceContainer: {
            type: "cc.Node",
            nodeName: "ActivePieceContainer",
          },
          activeGroupBorderGraphics: {
            type: "cc.Graphics",
            nodeName: "ActiveGroupBorderLayer",
          },
          sourcePreviewNode: { type: "cc.Node", nodeName: "SourcePreview" },
          sourcePreviewOverlay: {
            type: "cc.Graphics",
            nodeName: "SourcePreview",
          },
          sourcePreviewSprite: { type: "cc.Sprite", nodeName: "SourceImage" },
          sourcePreviewCountdownLabel: {
            type: "cc.Label",
            nodeName: "PreviewLabel",
          },
          timerBarBackground: {
            type: "cc.Graphics",
            nodeName: "TimerBarBackground",
          },
          timerBarFill: { type: "cc.Graphics", nodeName: "TimerBarFill" },
          timerLabel: { type: "cc.Label", nodeName: "TimerLabel" },
          restartButton: { type: "cc.Button", nodeName: "RestartButton" },
          backButton: { type: "cc.Button", nodeName: "BackButton" },
          addTimeToolButton: {
            type: "cc.Button",
            nodeName: "AddTimeToolButton",
          },
          viewSourceToolButton: {
            type: "cc.Button",
            nodeName: "ViewSourceToolButton",
          },
          autoMergeToolButton: {
            type: "cc.Button",
            nodeName: "AutoMergeToolButton",
          },
        },
        assetBindings: {
          piecePrefab: {
            type: "cc.Prefab",
            assetMetaPath:
              "assets/resources/prefabs/game/PuzzlePiece.prefab.meta",
          },
        },
      },
    ],
    checks: ["gamePanelHierarchy"],
  },
  {
    kind: "prefab",
    assetPath: "assets/resources/prefabs/home/UIHomePanel.prefab",
    scripts: [
      {
        className: "UIHomePanel",
        sourcePath: "assets/app/ui/home/UIHomePanel.ts",
        hostNodeName: "UIHomePanel",
        objectBindings: {
          titleLabel: { type: "cc.Label", nodeName: "TitleLabel" },
          startButton: { type: "cc.Button", nodeName: "StartButton" },
          startButtonLabel: { type: "cc.Label", nodeName: "StartButtonLabel" },
          tipLabel: { type: "cc.Label", nodeName: "TipLabel" },
          profileButton: { type: "cc.Button", nodeName: "ProfileButton" },
          profileAvatarRenderer: {
            scriptClassName: "PuzzleAvatarRenderer",
            scriptSourcePath:
              "assets/app/ui/common/PuzzleAvatarRenderer.ts",
            nodeName: "ProfileAvatar",
          },
          profileNameLabel: {
            type: "cc.Label",
            nodeName: "ProfileNameLabel",
          },
          settingsButton: { type: "cc.Button", nodeName: "SettingsButton" },
          settingsButtonGraphics: {
            type: "cc.Graphics",
            nodeName: "SettingsButton",
          },
        },
      },
      {
        className: "PuzzleAvatarRenderer",
        sourcePath: "assets/app/ui/common/PuzzleAvatarRenderer.ts",
        hostNodeName: "ProfileAvatar",
        objectBindings: {
          graphics: { type: "cc.Graphics", nodeName: "ProfileAvatar" },
          symbolLabel: { type: "cc.Label", nodeName: "SymbolLabel" },
        },
      },
    ],
  },
  {
    kind: "prefab",
    assetPath: "assets/resources/prefabs/item/PuzzleAvatarItem.prefab",
    scripts: [
      {
        className: "PuzzleAvatarItem",
        sourcePath: "assets/app/ui/item/PuzzleAvatarItem.ts",
        hostNodeName: "PuzzleAvatarItem",
        objectBindings: {
          selectButton: { type: "cc.Button", nodeName: "PuzzleAvatarItem" },
          avatarRenderer: {
            scriptClassName: "PuzzleAvatarRenderer",
            scriptSourcePath:
              "assets/app/ui/common/PuzzleAvatarRenderer.ts",
            nodeName: "Avatar",
          },
          nameLabel: { type: "cc.Label", nodeName: "NameLabel" },
          selectedLabel: { type: "cc.Label", nodeName: "SelectedLabel" },
        },
      },
      {
        className: "PuzzleAvatarRenderer",
        sourcePath: "assets/app/ui/common/PuzzleAvatarRenderer.ts",
        hostNodeName: "Avatar",
        objectBindings: {
          graphics: { type: "cc.Graphics", nodeName: "Avatar" },
          symbolLabel: { type: "cc.Label", nodeName: "SymbolLabel" },
        },
      },
    ],
  },
  {
    kind: "prefab",
    assetPath: "assets/resources/prefabs/popup/UIProfilePanel.prefab",
    scripts: [
      {
        className: "UIProfilePanel",
        sourcePath: "assets/app/ui/popup/UIProfilePanel.ts",
        hostNodeName: "UIProfilePanel",
        objectBindings: {
          overlayGraphics: { type: "cc.Graphics", nodeName: "UIProfilePanel" },
          panelGraphics: { type: "cc.Graphics", nodeName: "Panel" },
          closeButton: { type: "cc.Button", nodeName: "CloseButton" },
          closeButtonGraphics: {
            type: "cc.Graphics",
            nodeName: "CloseButton",
          },
          currentAvatarRenderer: {
            scriptClassName: "PuzzleAvatarRenderer",
            scriptSourcePath:
              "assets/app/ui/common/PuzzleAvatarRenderer.ts",
            nodeName: "CurrentAvatar",
          },
          nameEditBox: { type: "cc.EditBox", nodeName: "NameEditBox" },
          nameInputGraphics: {
            type: "cc.Graphics",
            nodeName: "NameEditBoxBackground",
          },
          saveNameButton: { type: "cc.Button", nodeName: "SaveNameButton" },
          saveNameGraphics: {
            type: "cc.Graphics",
            nodeName: "SaveNameButton",
          },
          avatarListContent: { type: "cc.Node", nodeName: "AvatarListContent" },
          feedbackLabel: { type: "cc.Label", nodeName: "FeedbackLabel" },
        },
      },
      {
        className: "PuzzleAvatarRenderer",
        sourcePath: "assets/app/ui/common/PuzzleAvatarRenderer.ts",
        hostNodeName: "CurrentAvatar",
        objectBindings: {
          graphics: { type: "cc.Graphics", nodeName: "CurrentAvatar" },
          symbolLabel: { type: "cc.Label", nodeName: "SymbolLabel" },
        },
      },
    ],
  },
  {
    kind: "prefab",
    assetPath: "assets/resources/prefabs/popup/UISettingsPanel.prefab",
    scripts: [
      {
        className: "UISettingsPanel",
        sourcePath: "assets/app/ui/popup/UISettingsPanel.ts",
        hostNodeName: "UISettingsPanel",
        objectBindings: {
          overlayGraphics: {
            type: "cc.Graphics",
            nodeName: "UISettingsPanel",
          },
          panelGraphics: { type: "cc.Graphics", nodeName: "Panel" },
          closeButton: { type: "cc.Button", nodeName: "CloseButton" },
          closeButtonGraphics: {
            type: "cc.Graphics",
            nodeName: "CloseButton",
          },
          soundButton: { type: "cc.Button", nodeName: "SoundButton" },
          soundGraphics: { type: "cc.Graphics", nodeName: "SoundButton" },
          soundValueLabel: {
            type: "cc.Label",
            nodeName: "SoundButtonLabel",
          },
          vibrationButton: {
            type: "cc.Button",
            nodeName: "VibrationButton",
          },
          vibrationGraphics: {
            type: "cc.Graphics",
            nodeName: "VibrationButton",
          },
          vibrationValueLabel: {
            type: "cc.Label",
            nodeName: "VibrationButtonLabel",
          },
          helpButton: { type: "cc.Button", nodeName: "HelpButton" },
          helpGraphics: { type: "cc.Graphics", nodeName: "HelpButton" },
          ratingButton: { type: "cc.Button", nodeName: "RatingButton" },
          ratingGraphics: { type: "cc.Graphics", nodeName: "RatingButton" },
          privacyButton: { type: "cc.Button", nodeName: "PrivacyButton" },
          privacyGraphics: { type: "cc.Graphics", nodeName: "PrivacyButton" },
          termsButton: { type: "cc.Button", nodeName: "TermsButton" },
          termsGraphics: { type: "cc.Graphics", nodeName: "TermsButton" },
          feedbackLabel: { type: "cc.Label", nodeName: "FeedbackLabel" },
          versionLabel: { type: "cc.Label", nodeName: "VersionLabel" },
        },
      },
    ],
  },
  {
    kind: "prefab",
    assetPath: "assets/resources/prefabs/popup/UIResultPanel.prefab",
    scripts: [
      {
        className: "UIResultPanel",
        sourcePath: "assets/app/ui/popup/UIResultPanel.ts",
        hostNodeName: "UIResultPanel",
        objectBindings: {
          overlayGraphics: { type: "cc.Graphics", nodeName: "UIResultPanel" },
          panelGraphics: { type: "cc.Graphics", nodeName: "Panel" },
          titleLabel: { type: "cc.Label", nodeName: "TitleLabel" },
          messageLabel: { type: "cc.Label", nodeName: "MessageLabel" },
          primaryButton: { type: "cc.Button", nodeName: "PrimaryButton" },
          primaryButtonGraphics: {
            type: "cc.Graphics",
            nodeName: "PrimaryButton",
          },
          primaryButtonLabel: { type: "cc.Label", nodeName: "Label" },
          homeButton: { type: "cc.Button", nodeName: "HomeButton" },
          homeButtonGraphics: { type: "cc.Graphics", nodeName: "HomeButton" },
        },
      },
    ],
  },
];
