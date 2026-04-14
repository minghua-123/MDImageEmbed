/*
MDImageEmbed - Obsidian Plugin
将 Markdown 图片转换为 Base64 内嵌格式
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MDImageEmbedPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var { remote } = require("electron");
var { dialog } = remote;
var path = require("path");
var fs = require("fs");
var DEFAULT_SETTINGS = {
  showConversionLog: false,
  showDetailedLog: false,
  convertWikiLinks: true,
  skipBase64Images: true,
  prefixFilePath: "",
  suffixFilePath: "",
  defaultExportPath: "",
  showRibbonIcon: true
};
var MDImageEmbedPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.ribbonIconEl = null;
  }
  // ========== 插件生命周期 ==========
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MDImageEmbedSettingTab(this.app, this));
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof import_obsidian.TFile && file.extension === "md") {
          this.addFileMenuItems(menu, file);
        }
      })
    );
    this.updateRibbonIcon();
    console.log("MD Image Embed plugin loaded");
  }
  // ========== 更新侧边栏图标 ==========
  updateRibbonIcon() {
    if (this.ribbonIconEl) {
      this.ribbonIconEl.remove();
      this.ribbonIconEl = null;
    }
    if (this.settings.showRibbonIcon) {
      this.ribbonIconEl = this.addRibbonIcon("download", "MD Image Embed \u5BFC\u51FA", async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile instanceof import_obsidian.TFile && activeFile.extension === "md") {
          await this.showExportDialog(activeFile);
        } else {
          new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A Markdown \u6587\u4EF6");
        }
      });
    }
  }
  onunload() {
    console.log("MD Image Embed plugin unloaded");
  }
  // ========== 设置管理 ==========
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  // ========== 右键菜单 ==========
  addFileMenuItems(menu, file) {
    menu.addItem((item) => {
      item.setTitle("\u590D\u5236\u4E3A Base64 \u683C\u5F0F").setIcon("clipboard-copy").onClick(async () => {
        await this.copyAsBase64(file);
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u5BFC\u51FA\u4E3A Base64 \u683C\u5F0F").setIcon("download").onClick(async () => {
        await this.showExportDialog(file);
      });
    });
  }
  // ========== 辅助方法: 读取前缀/后缀文件内容 ==========
  async readTemplateFile(filePath) {
    if (!filePath || filePath.trim() === "") {
      return "";
    }
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath.trim());
      if (file instanceof import_obsidian.TFile) {
        const content = await this.app.vault.read(file);
        if (this.settings.showConversionLog) {
          console.log(`[MDImageEmbed] \u6210\u529F\u8BFB\u53D6\u6A21\u677F\u6587\u4EF6: ${filePath}`);
        }
        return content;
      } else {
        if (this.settings.showConversionLog) {
          console.warn(`[MDImageEmbed] \u6A21\u677F\u6587\u4EF6\u672A\u627E\u5230: ${filePath}`);
        }
        return "";
      }
    } catch (error) {
      if (this.settings.showConversionLog) {
        console.error(`[MDImageEmbed] \u8BFB\u53D6\u6A21\u677F\u6587\u4EF6\u5931\u8D25: ${filePath}`, error);
      }
      return "";
    }
  }
  // ========== 功能 1: 复制到剪贴板 ==========
  async copyAsBase64(file) {
    try {
      let content = await this.app.vault.read(file);
      const prefix = await this.readTemplateFile(this.settings.prefixFilePath);
      if (prefix) {
        content = prefix + "\n\n" + content;
      }
      const suffix = await this.readTemplateFile(this.settings.suffixFilePath);
      if (suffix) {
        content = content + "\n\n" + suffix;
      }
      const result = await this.convertMarkdownToBase64(content, file);
      await navigator.clipboard.writeText(result.content);
      if (this.settings.showConversionLog) {
        this.showDetailedResults(result);
      } else {
        new import_obsidian.Notice("\u2705 \u5DF2\u590D\u5236\u4E3A Base64 \u683C\u5F0F");
      }
    } catch (error) {
      new import_obsidian.Notice("\u274C \u590D\u5236\u5931\u8D25: " + error.message);
      console.error("Copy failed:", error);
    }
  }
  // ========== 显示导出设置对话框 ==========
  async showExportDialog(file) {
    const modal = new ExportDialog(this.app, this, file);
    modal.open();
  }
  // ========== 功能 2: 导出为文件 ==========
  async exportAsBase64(file, exportPath, exportName) {
    try {
      let content = await this.app.vault.read(file);
      const prefix = await this.readTemplateFile(this.settings.prefixFilePath);
      if (prefix) {
        content = prefix + "\n\n" + content;
      }
      const suffix = await this.readTemplateFile(this.settings.suffixFilePath);
      if (suffix) {
        content = content + "\n\n" + suffix;
      }
      const result = await this.convertMarkdownToBase64(content, file);
      const exportFileName = exportName || file.name.replace(".md", "_base64.md");
      let exportFilePath;
      if (exportPath && exportPath.trim() !== "") {
        exportFilePath = `${exportPath.trim()}/${exportFileName}`;
      } else if (this.settings.defaultExportPath && this.settings.defaultExportPath.trim() !== "") {
        exportFilePath = `${this.settings.defaultExportPath.trim()}/${exportFileName}`;
      } else {
        exportFilePath = file.parent ? `${file.parent.path}/${exportFileName}` : exportFileName;
      }
      await this.app.vault.create(exportFilePath, result.content);
      if (this.settings.showConversionLog) {
        let message = "\u2705 \u5DF2\u5BFC\u51FA\u4E3A Base64 \u683C\u5F0F\u6587\u4EF6\n";
        message += `\u{1F4C1} \u5BFC\u51FA\u8DEF\u5F84: ${exportFilePath}

`;
        message += `\u{1F4CA} \u7EDF\u8BA1: ${result.convertedCount + result.skippedCount} \u4E2A\u56FE\u7247
`;
        message += `   \u2022 \u5DF2\u8F6C\u6362: ${result.convertedCount}
`;
        message += `   \u2022 \u5DF2\u8DF3\u8FC7: ${result.skippedCount}`;
        if (this.settings.showDetailedLog) {
          message += "\n\n";
          const maxDisplay = 8;
          const detailsToShow = result.details.slice(0, maxDisplay);
          for (const detail of detailsToShow) {
            const fileName = detail.path.split("/").pop() || detail.path;
            const shortName = fileName.length > 35 ? fileName.substring(0, 32) + "..." : fileName;
            if (detail.status === "success") {
              message += `\u2713 ${shortName}
`;
            } else if (detail.status === "failed") {
              message += `\u2717 ${shortName}
  \u2192 ${detail.reason}
`;
            } else if (detail.status === "skipped") {
              message += `\u2298 ${shortName}
  \u2192 ${detail.reason}
`;
            }
          }
          if (result.details.length > maxDisplay) {
            const remaining = result.details.length - maxDisplay;
            message += `
... \u8FD8\u6709 ${remaining} \u4E2A`;
          }
        }
        new import_obsidian.Notice(message, 8e3);
      } else {
        new import_obsidian.Notice(`\u2705 \u5DF2\u5BFC\u51FA\u4E3A Base64 \u683C\u5F0F\u6587\u4EF6: ${exportFileName}`);
      }
    } catch (error) {
      new import_obsidian.Notice("\u274C \u5BFC\u51FA\u5931\u8D25: " + error.message);
      console.error("Export failed:", error);
    }
  }
  // ========== 显示详细处理结果 ==========
  showDetailedResults(result) {
    const total = result.convertedCount + result.skippedCount;
    let message = "\u2705 \u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\n\n";
    message += `\u{1F4CA} \u7EDF\u8BA1: ${total} \u4E2A\u56FE\u7247
`;
    message += `   \u2022 \u5DF2\u8F6C\u6362: ${result.convertedCount}
`;
    message += `   \u2022 \u5DF2\u8DF3\u8FC7: ${result.skippedCount}`;
    if (this.settings.showDetailedLog) {
      message += "\n\n";
      const maxDisplay = 8;
      const detailsToShow = result.details.slice(0, maxDisplay);
      for (const detail of detailsToShow) {
        const fileName = detail.path.split("/").pop() || detail.path;
        const shortName = fileName.length > 35 ? fileName.substring(0, 32) + "..." : fileName;
        if (detail.status === "success") {
          message += `\u2713 ${shortName}
`;
        } else if (detail.status === "failed") {
          message += `\u2717 ${shortName}
  \u2192 ${detail.reason}
`;
        } else if (detail.status === "skipped") {
          message += `\u2298 ${shortName}
  \u2192 ${detail.reason}
`;
        }
      }
      if (result.details.length > maxDisplay) {
        const remaining = result.details.length - maxDisplay;
        message += `
... \u8FD8\u6709 ${remaining} \u4E2A`;
      }
    }
    message += `

\u{1F4A1} \u63A7\u5236\u53F0 (Ctrl+Shift+I) \u67E5\u770B\u5B8C\u6574\u8BE6\u60C5`;
    new import_obsidian.Notice(message, 8e3);
  }
  // ========== 核心转换逻辑 ==========
  async convertMarkdownToBase64(content, sourceFile) {
    const imgRegex = /!\[([^\]]*)\]\(<?([^)">]+)>?\)|!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg|bmp))\]\]/gi;
    let result = content;
    let convertedCount = 0;
    let skippedCount = 0;
    const details = [];
    const matches = [...content.matchAll(imgRegex)];
    if (this.settings.showConversionLog) {
      console.log(`[MDImageEmbed] \u5F00\u59CB\u5904\u7406\u6587\u6863\uFF0C\u5171\u627E\u5230 ${matches.length} \u4E2A\u56FE\u7247`);
    }
    for (const match of matches) {
      const fullMatch = match[0];
      if (match[1] !== void 0) {
        const altText = match[1];
        const imagePath = match[2];
        if (this.settings.skipBase64Images && imagePath.startsWith("data:image")) {
          skippedCount++;
          const displayPath = imagePath.substring(0, 30) + "...";
          details.push({ path: displayPath, status: "skipped", reason: "\u5DF2\u662F Base64 \u683C\u5F0F" });
          if (this.settings.showConversionLog) {
            console.log(`[\u8DF3\u8FC7] ${displayPath} - \u539F\u56E0: \u5DF2\u662F Base64 \u683C\u5F0F`);
          }
          continue;
        }
        if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
          skippedCount++;
          details.push({ path: imagePath, status: "skipped", reason: "\u7F51\u7EDC\u56FE\u7247\uFF08\u4E0D\u652F\u6301\uFF09" });
          if (this.settings.showConversionLog) {
            console.log(`[\u8DF3\u8FC7] ${imagePath} - \u539F\u56E0: \u7F51\u7EDC\u56FE\u7247\u4E0D\u652F\u6301\u8F6C\u6362`);
          }
          continue;
        }
        const base64 = await this.imageToBase64(imagePath, sourceFile);
        if (base64) {
          result = result.replace(fullMatch, `![${altText}](${base64})`);
          convertedCount++;
          details.push({ path: imagePath, status: "success" });
          if (this.settings.showConversionLog) {
            console.log(`[\u6210\u529F] ${imagePath} - \u5DF2\u8F6C\u6362\u4E3A Base64`);
          }
        } else {
          skippedCount++;
          details.push({ path: imagePath, status: "failed", reason: "File not found" });
          if (this.settings.showConversionLog) {
            console.log(`[\u5931\u8D25] ${imagePath} - \u539F\u56E0: \u6587\u4EF6\u672A\u627E\u5230\u6216\u8BFB\u53D6\u5931\u8D25`);
          }
        }
      } else if (match[3] !== void 0) {
        const imageName = match[3];
        const displayPath = `![[${imageName}]]`;
        if (!this.settings.convertWikiLinks) {
          skippedCount++;
          details.push({ path: displayPath, status: "skipped", reason: "Wiki \u94FE\u63A5\u8F6C\u6362\u5DF2\u7981\u7528" });
          if (this.settings.showConversionLog) {
            console.log(`[\u8DF3\u8FC7] ${displayPath} - \u539F\u56E0: Wiki \u94FE\u63A5\u8F6C\u6362\u5DF2\u7981\u7528`);
          }
          continue;
        }
        const base64 = await this.imageToBase64(imageName, sourceFile);
        if (base64) {
          result = result.replace(fullMatch, `![${imageName}](${base64})`);
          convertedCount++;
          details.push({ path: displayPath, status: "success" });
          if (this.settings.showConversionLog) {
            console.log(`[\u6210\u529F] ${displayPath} - \u5DF2\u8F6C\u6362\u4E3A Base64`);
          }
        } else {
          skippedCount++;
          details.push({ path: displayPath, status: "failed", reason: "File not found" });
          if (this.settings.showConversionLog) {
            console.log(`[\u5931\u8D25] ${displayPath} - \u539F\u56E0: \u6587\u4EF6\u672A\u627E\u5230\u6216\u8BFB\u53D6\u5931\u8D25`);
          }
        }
      }
    }
    if (this.settings.showConversionLog) {
      console.log(`[MDImageEmbed] \u5904\u7406\u5B8C\u6210: ${convertedCount} \u4E2A\u6210\u529F, ${skippedCount} \u4E2A\u8DF3\u8FC7`);
    }
    return { content: result, convertedCount, skippedCount, details };
  }
  // ========== 图片转 Base64 ==========
  async imageToBase64(imagePath, sourceFile) {
    try {
      const imageFile = this.resolveImagePath(imagePath, sourceFile);
      if (!imageFile) {
        if (this.settings.showConversionLog) {
          console.warn(`  \u2514\u2500 \u8DEF\u5F84\u89E3\u6790\u5931\u8D25: \u5728\u4EE5\u4E0B\u4F4D\u7F6E\u90FD\u672A\u627E\u5230\u6587\u4EF6`);
          console.warn(`     - Vault \u6839\u76EE\u5F55: ${imagePath}`);
          if (sourceFile.parent) {
            console.warn(`     - \u76F8\u5BF9\u8DEF\u5F84: ${sourceFile.parent.path}/${imagePath}`);
          }
        }
        return null;
      }
      if (this.settings.showConversionLog) {
        console.log(`  \u2514\u2500 \u6587\u4EF6\u5DF2\u627E\u5230: ${imageFile.path}`);
      }
      const arrayBuffer = await this.app.vault.readBinary(imageFile);
      const base64 = this.arrayBufferToBase64(arrayBuffer);
      const mimeType = this.getMimeType(imageFile.extension);
      if (this.settings.showConversionLog) {
        const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(2);
        console.log(`  \u2514\u2500 \u6587\u4EF6\u5927\u5C0F: ${sizeKB} KB, MIME: ${mimeType}`);
      }
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      if (this.settings.showConversionLog) {
        console.error(`  \u2514\u2500 \u8BFB\u53D6\u6216\u8F6C\u6362\u5931\u8D25: ${error.message}`);
      }
      return null;
    }
  }
  // ========== 路径解析 ==========
  resolveImagePath(imagePath, sourceFile) {
    let cleanPath = imagePath.replace(/^<|>$/g, "").trim();
    try {
      const decoded = decodeURIComponent(cleanPath);
      if (decoded !== cleanPath) {
        if (this.settings.showConversionLog) {
          console.log(`  \u2514\u2500 URL \u89E3\u7801: "${cleanPath}" \u2192 "${decoded}"`);
        }
      }
      cleanPath = decoded;
    } catch (e) {
      if (this.settings.showConversionLog) {
        console.warn(`  \u2514\u2500 URL \u89E3\u7801\u5931\u8D25\uFF0C\u4F7F\u7528\u539F\u8DEF\u5F84: ${cleanPath}`);
      }
    }
    let file = this.app.vault.getAbstractFileByPath(cleanPath);
    if (file instanceof import_obsidian.TFile) {
      if (this.settings.showConversionLog) {
        console.log(`  \u2514\u2500 \u89E3\u6790\u65B9\u6CD5: Vault \u6839\u76EE\u5F55`);
      }
      return file;
    }
    if (sourceFile.parent) {
      const relativePath = `${sourceFile.parent.path}/${cleanPath}`;
      file = this.app.vault.getAbstractFileByPath(relativePath);
      if (file instanceof import_obsidian.TFile) {
        if (this.settings.showConversionLog) {
          console.log(`  \u2514\u2500 \u89E3\u6790\u65B9\u6CD5: \u76F8\u5BF9\u8DEF\u5F84 (${sourceFile.parent.path}/)`);
        }
        return file;
      }
    }
    const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, sourceFile.path);
    if (resolvedFile instanceof import_obsidian.TFile) {
      if (this.settings.showConversionLog) {
        console.log(`  \u2514\u2500 \u89E3\u6790\u65B9\u6CD5: Obsidian \u94FE\u63A5\u89E3\u6790`);
      }
      return resolvedFile;
    }
    return null;
  }
  // ========== ArrayBuffer 转 Base64 ==========
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  // ========== 获取 MIME 类型 ==========
  getMimeType(extension) {
    const mimeTypes = {
      "png": "image/png",
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "gif": "image/gif",
      "webp": "image/webp",
      "svg": "image/svg+xml",
      "bmp": "image/bmp"
    };
    return mimeTypes[extension.toLowerCase()] || "image/png";
  }
};
var MDImageEmbedSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "MD Image Embed \u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u663E\u793A\u8F6C\u6362\u65E5\u5FD7").setDesc("\u5728\u901A\u77E5\u4E2D\u663E\u793A\u8F6C\u6362\u6458\u8981\u4FE1\u606F").addToggle((toggle) => toggle.setValue(this.plugin.settings.showConversionLog).onChange(async (value) => {
      this.plugin.settings.showConversionLog = value;
      await this.plugin.saveSettings();
      this.display();
    }));
    if (this.plugin.settings.showConversionLog) {
      new import_obsidian.Setting(containerEl).setName("\u663E\u793A\u8BE6\u7EC6\u65E5\u5FD7").setDesc('\u5728\u901A\u77E5\u4E2D\u663E\u793A\u6BCF\u4E2A\u56FE\u7247\u7684\u72B6\u6001\uFF08\u9700\u8981\u542F\u7528"\u663E\u793A\u8F6C\u6362\u65E5\u5FD7"\uFF09').addToggle((toggle) => toggle.setValue(this.plugin.settings.showDetailedLog).onChange(async (value) => {
        this.plugin.settings.showDetailedLog = value;
        await this.plugin.saveSettings();
      }));
    }
    new import_obsidian.Setting(containerEl).setName("\u8F6C\u6362 Wiki \u94FE\u63A5").setDesc("\u5C06 Obsidian Wiki \u94FE\u63A5 (![[image.png]]) \u8F6C\u6362\u4E3A\u6807\u51C6 Markdown Base64 \u683C\u5F0F").addToggle((toggle) => toggle.setValue(this.plugin.settings.convertWikiLinks).onChange(async (value) => {
      this.plugin.settings.convertWikiLinks = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u8DF3\u8FC7 Base64 \u56FE\u7247").setDesc("\u8DF3\u8FC7\u5DF2\u7ECF\u662F Base64 \u683C\u5F0F\u7684\u56FE\u7247").addToggle((toggle) => toggle.setValue(this.plugin.settings.skipBase64Images).onChange(async (value) => {
      this.plugin.settings.skipBase64Images = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "\u9632\u8F6C\u8F7D\u4FDD\u62A4" });
    new import_obsidian.Setting(containerEl).setName("\u524D\u7F00\u6587\u4EF6\u8DEF\u5F84").setDesc('\u6DFB\u52A0\u5230\u6587\u7AE0\u5F00\u5934\u7684 Markdown \u6587\u4EF6\u8DEF\u5F84\uFF08\u5982 "templates/prefix.md"\uFF09\uFF0C\u7559\u7A7A\u7981\u7528').addText((text) => text.setPlaceholder("templates/prefix.md").setValue(this.plugin.settings.prefixFilePath).onChange(async (value) => {
      this.plugin.settings.prefixFilePath = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u540E\u7F00\u6587\u4EF6\u8DEF\u5F84").setDesc('\u6DFB\u52A0\u5230\u6587\u7AE0\u7ED3\u5C3E\u7684 Markdown \u6587\u4EF6\u8DEF\u5F84\uFF08\u5982 "templates/suffix.md"\uFF09\uFF0C\u7559\u7A7A\u7981\u7528').addText((text) => text.setPlaceholder("templates/suffix.md").setValue(this.plugin.settings.suffixFilePath).onChange(async (value) => {
      this.plugin.settings.suffixFilePath = value.trim();
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "\u5BFC\u51FA\u8BBE\u7F6E" });
    const defaultPathSetting = new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u5BFC\u51FA\u8DEF\u5F84").setDesc("\u5BFC\u51FA\u6587\u4EF6\u7684\u9ED8\u8BA4\u4FDD\u5B58\u8DEF\u5F84\uFF0C\u7559\u7A7A\u5219\u4FDD\u5B58\u5728\u6E90\u6587\u4EF6\u6240\u5728\u76EE\u5F55");
    let defaultPathInputEl;
    defaultPathSetting.addText((text) => {
      defaultPathInputEl = text.inputEl;
      defaultPathInputEl.style.width = "100%";
      defaultPathInputEl.style.minWidth = "300px";
      text.setPlaceholder("exports/").setValue(this.plugin.settings.defaultExportPath).onChange(async (value) => {
        this.plugin.settings.defaultExportPath = value.trim();
        await this.plugin.saveSettings();
      });
    });
    defaultPathSetting.addButton((button) => button.setButtonText("Vault\u5185\u6D4F\u89C8").onClick(() => {
      const folderModal = new FolderSuggestModal(this.app, (selectedFolder) => {
        this.plugin.settings.defaultExportPath = selectedFolder.path;
        if (defaultPathInputEl) {
          defaultPathInputEl.value = selectedFolder.path;
        }
        this.plugin.saveSettings();
      });
      folderModal.open();
    }));
    defaultPathSetting.addButton((button) => button.setButtonText("\u7CFB\u7EDF\u6D4F\u89C8").onClick(async () => {
      try {
        const vaultPath = this.app.vault.adapter.basePath;
        const result = await dialog.showOpenDialog(remote.getCurrentWindow(), {
          title: "\u9009\u62E9\u9ED8\u8BA4\u5BFC\u51FA\u6587\u4EF6\u5939",
          defaultPath: vaultPath,
          properties: ["openDirectory", "createDirectory"]
        });
        if (!result.canceled && result.filePaths.length > 0) {
          const selectedPath = result.filePaths[0];
          const relativePath = path.relative(vaultPath, selectedPath);
          if (relativePath.startsWith("..")) {
            new import_obsidian.Notice("\u8BF7\u9009\u62E9Vault\u5185\u7684\u6587\u4EF6\u5939");
          } else {
            const vaultPathFormatted = relativePath.replace(/\\/g, "/") || "/";
            this.plugin.settings.defaultExportPath = vaultPathFormatted;
            if (defaultPathInputEl) {
              defaultPathInputEl.value = vaultPathFormatted;
            }
            await this.plugin.saveSettings();
          }
        }
      } catch (error) {
        new import_obsidian.Notice("\u9009\u62E9\u6587\u4EF6\u5939\u5931\u8D25: " + error.message);
        console.error("Folder selection failed:", error);
      }
    }));
    new import_obsidian.Setting(containerEl).setName("\u663E\u793A\u4FA7\u8FB9\u680F\u56FE\u6807").setDesc("\u5728\u5DE6\u4FA7\u8FB9\u680F\u663E\u793A MD Image Embed \u5BFC\u51FA\u6309\u94AE").addToggle((toggle) => toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
      this.plugin.settings.showRibbonIcon = value;
      await this.plugin.saveSettings();
      this.plugin.updateRibbonIcon();
    }));
  }
};
var ExportDialog = class extends import_obsidian.Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.exportPath = plugin.settings.defaultExportPath || (file.parent ? file.parent.path : "");
    this.exportName = file.name.replace(".md", "_base64.md");
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "\u5BFC\u51FA\u8BBE\u7F6E" });
    contentEl.createEl("h3", { text: "\u5BFC\u51FA\u8DEF\u5F84" });
    const pathSetting = new import_obsidian.Setting(contentEl).setName("\u5BFC\u51FA\u6587\u4EF6\u5939").setDesc("\u9009\u62E9\u5BFC\u51FA\u6587\u4EF6\u7684\u4FDD\u5B58\u4F4D\u7F6E").setClass("md-image-embed-path-setting");
    let pathInputEl;
    pathSetting.addText((text) => {
      pathInputEl = text.inputEl;
      pathInputEl.style.width = "100%";
      pathInputEl.style.minWidth = "300px";
      text.setPlaceholder("\u8F93\u5165\u6587\u4EF6\u5939\u8DEF\u5F84").setValue(this.exportPath).onChange((value) => {
        this.exportPath = value;
      });
    });
    pathSetting.addButton((button) => button.setButtonText("Vault\u5185\u6D4F\u89C8").onClick(() => {
      const folderModal = new FolderSuggestModal(this.app, (selectedFolder) => {
        this.exportPath = selectedFolder.path;
        if (pathInputEl) {
          pathInputEl.value = selectedFolder.path;
        }
      });
      folderModal.open();
    }));
    pathSetting.addButton((button) => button.setButtonText("\u7CFB\u7EDF\u6D4F\u89C8").onClick(async () => {
      try {
        const vaultPath = this.app.vault.adapter.basePath;
        const result = await dialog.showOpenDialog(remote.getCurrentWindow(), {
          title: "\u9009\u62E9\u5BFC\u51FA\u6587\u4EF6\u5939",
          defaultPath: vaultPath,
          properties: ["openDirectory", "createDirectory"]
        });
        if (!result.canceled && result.filePaths.length > 0) {
          const selectedPath = result.filePaths[0];
          const relativePath = path.relative(vaultPath, selectedPath);
          if (relativePath.startsWith("..")) {
            new import_obsidian.Notice("\u8BF7\u9009\u62E9Vault\u5185\u7684\u6587\u4EF6\u5939");
          } else {
            const vaultPathFormatted = relativePath.replace(/\\/g, "/") || "/";
            this.exportPath = vaultPathFormatted;
            if (pathInputEl) {
              pathInputEl.value = vaultPathFormatted;
            }
          }
        }
      } catch (error) {
        new import_obsidian.Notice("\u9009\u62E9\u6587\u4EF6\u5939\u5931\u8D25: " + error.message);
        console.error("Folder selection failed:", error);
      }
    }));
    contentEl.createEl("h3", { text: "\u5BFC\u51FA\u6587\u4EF6\u540D" });
    new import_obsidian.Setting(contentEl).setName("\u6587\u4EF6\u540D").setDesc("\u8BBE\u7F6E\u5BFC\u51FA\u6587\u4EF6\u7684\u540D\u79F0").addText((text) => text.setPlaceholder("\u8F93\u5165\u6587\u4EF6\u540D").setValue(this.exportName).onChange((value) => {
      this.exportName = value;
    }));
    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.gap = "10px";
    new import_obsidian.ButtonComponent(buttonContainer).setButtonText("\u53D6\u6D88").onClick(() => {
      this.close();
    });
    new import_obsidian.ButtonComponent(buttonContainer).setButtonText("\u5BFC\u51FA").setCta().onClick(async () => {
      await this.plugin.exportAsBase64(this.file, this.exportPath, this.exportName);
      this.close();
    });
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var FolderSuggestModal = class extends import_obsidian.SuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.allFolders = [];
    this.collectFolders(app.vault.getRoot());
    this.setPlaceholder("\u9009\u62E9\u6587\u4EF6\u5939...");
  }
  // 递归收集所有文件夹
  collectFolders(folder) {
    this.allFolders.push(folder);
    for (const child of folder.children) {
      if (child instanceof import_obsidian.TFolder) {
        this.collectFolders(child);
      }
    }
  }
  getSuggestions(query) {
    return this.allFolders.filter((folder) => {
      const folderPath = folder.path.toLowerCase();
      const queryLower = query.toLowerCase();
      return folderPath.includes(queryLower) || folder.name && folder.name.toLowerCase().includes(queryLower);
    });
  }
  renderSuggestion(folder, el) {
    el.createDiv({ text: folder.path === "/" ? "\u{1F4C1} \u6839\u76EE\u5F55" : `\u{1F4C1} ${folder.path}` });
  }
  onChooseSuggestion(folder, evt) {
    this.onChoose(folder);
  }
};
/**
 * MDImageEmbed - Obsidian Plugin
 * Convert local images in Markdown to Base64 embedded format
 *
 * @author minghua-123
 * @license MIT
 */
