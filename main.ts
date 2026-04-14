/**
 * MDImageEmbed - Obsidian Plugin
 * Convert local images in Markdown to Base64 embedded format
 *
 * @author minghua-123
 * @license MIT
 */
import { Plugin, TFile, Notice, Menu, PluginSettingTab, App, Setting, Modal, ButtonComponent, TextComponent } from 'obsidian';

// ========== 设置接口 ==========
interface MDImageEmbedSettings {
	showConversionLog: boolean;        // 是否显示转换日志
	showDetailedLog: boolean;           // 是否显示详细日志（每个图片的状态）
	convertWikiLinks: boolean;          // 是否转换 Wiki 链接
	skipBase64Images: boolean;          // 是否跳过已有 Base64
	prefixFilePath: string;             // 前缀文件路径（添加到文章开头）
	suffixFilePath: string;             // 后缀文件路径（添加到文章结尾）
	defaultExportPath: string;          // 默认导出路径
	showRibbonIcon: boolean;            // 是否显示侧边栏图标
}

const DEFAULT_SETTINGS: MDImageEmbedSettings = {
	showConversionLog: false,
	showDetailedLog: false,
	convertWikiLinks: true,
	skipBase64Images: true,
	prefixFilePath: '',
	suffixFilePath: '',
	defaultExportPath: '',
	showRibbonIcon: true
}

// ========== 主插件类 ==========
export default class MDImageEmbedPlugin extends Plugin {
	settings: MDImageEmbedSettings;
	ribbonIconEl: HTMLElement | null = null;

	// ========== 插件生命周期 ==========
	async onload() {
		await this.loadSettings();

		// 注册设置面板
		this.addSettingTab(new MDImageEmbedSettingTab(this.app, this));

		// 注册文件菜单事件（右键菜单）
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.addFileMenuItems(menu, file);
				}
			})
		);

		// 注册侧边栏图标（根据设置）
		this.updateRibbonIcon();

		console.log('MD Image Embed plugin loaded');
	}

	// ========== 更新侧边栏图标 ==========
	updateRibbonIcon() {
		// 先移除现有的侧边栏图标
		if (this.ribbonIconEl) {
			this.ribbonIconEl.remove();
			this.ribbonIconEl = null;
		}

		// 根据设置添加侧边栏图标
		if (this.settings.showRibbonIcon) {
			this.ribbonIconEl = this.addRibbonIcon('download', 'MD Image Embed 导出', async () => {
				// 获取当前活动文件
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile instanceof TFile && activeFile.extension === 'md') {
					await this.showExportDialog(activeFile);
				} else {
					new Notice('请先打开一个 Markdown 文件');
				}
			});
		}
	}

	onunload() {
		console.log('MD Image Embed plugin unloaded');
	}

	// ========== 设置管理 ==========
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ========== 右键菜单 ==========
	addFileMenuItems(menu: Menu, file: TFile) {
		// 菜单项: 复制为 Base64 格式到剪贴板
		menu.addItem((item) => {
			item
				.setTitle('复制为 Base64 格式')
				.setIcon('clipboard-copy')
				.onClick(async () => {
					await this.copyAsBase64(file);
				});
		});

		// 菜单项: 导出为 Base64 格式文件
		menu.addItem((item) => {
			item
				.setTitle('导出为 Base64 格式')
				.setIcon('download')
				.onClick(async () => {
					await this.showExportDialog(file);
				});
		});
	}

	// ========== 辅助方法: 读取前缀/后缀文件内容 ==========
	async readTemplateFile(filePath: string): Promise<string> {
		if (!filePath || filePath.trim() === '') {
			return '';
		}

		try {
			// 尝试从 Vault 中读取文件
			const file = this.app.vault.getAbstractFileByPath(filePath.trim());
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				if (this.settings.showConversionLog) {
					console.log(`[MDImageEmbed] 成功读取模板文件: ${filePath}`);
				}
				return content;
			} else {
				if (this.settings.showConversionLog) {
					console.warn(`[MDImageEmbed] 模板文件未找到: ${filePath}`);
				}
				return '';
			}
		} catch (error) {
			if (this.settings.showConversionLog) {
				console.error(`[MDImageEmbed] 读取模板文件失败: ${filePath}`, error);
			}
			return '';
		}
	}

	// ========== 功能 1: 复制到剪贴板 ==========
	async copyAsBase64(file: TFile) {
		try {
			let content = await this.app.vault.read(file);

			// 添加前缀内容
			const prefix = await this.readTemplateFile(this.settings.prefixFilePath);
			if (prefix) {
				content = prefix + '\n\n' + content;
			}

			// 添加后缀内容
			const suffix = await this.readTemplateFile(this.settings.suffixFilePath);
			if (suffix) {
				content = content + '\n\n' + suffix;
			}

			const result = await this.convertMarkdownToBase64(content, file);

			// 复制到剪贴板
			await navigator.clipboard.writeText(result.content);

			if (this.settings.showConversionLog) {
				// 显示详细的处理结果
				this.showDetailedResults(result);
			} else {
				new Notice('✅ 已复制为 Base64 格式');
			}
		} catch (error) {
			new Notice('❌ 复制失败: ' + error.message);
			console.error('Copy failed:', error);
		}
	}

	// ========== 显示导出设置对话框 ==========
	async showExportDialog(file: TFile) {
		// 创建对话框
		const modal = new ExportDialog(this.app, this, file);
		modal.open();
	}

	// ========== 功能 2: 导出为文件 ==========
	async exportAsBase64(file: TFile, exportPath?: string, exportName?: string) {
		try {
			let content = await this.app.vault.read(file);

			// 添加前缀内容
			const prefix = await this.readTemplateFile(this.settings.prefixFilePath);
			if (prefix) {
				content = prefix + '\n\n' + content;
			}

			// 添加后缀内容
			const suffix = await this.readTemplateFile(this.settings.suffixFilePath);
			if (suffix) {
				content = content + '\n\n' + suffix;
			}

			const result = await this.convertMarkdownToBase64(content, file);

			// 生成导出文件路径
			const exportFileName = exportName || file.name.replace('.md', '_base64.md');
			let exportFilePath;
			
			// 检查是否指定了导出路径
			if (exportPath && exportPath.trim() !== '') {
				// 使用指定的导出路径
				exportFilePath = `${exportPath.trim()}/${exportFileName}`;
			} else if (this.settings.defaultExportPath && this.settings.defaultExportPath.trim() !== '') {
				// 使用默认导出路径
				exportFilePath = `${this.settings.defaultExportPath.trim()}/${exportFileName}`;
			} else {
				// 使用源文件所在目录
				exportFilePath = file.parent ? `${file.parent.path}/${exportFileName}` : exportFileName;
			}

			// 写入文件
			await this.app.vault.create(exportFilePath, result.content);

			if (this.settings.showConversionLog) {
				// 显示详细的处理结果
				let message = '✅ 已导出为 Base64 格式文件\n';
				message += `📁 导出路径: ${exportFilePath}\n\n`;
				message += `📊 统计: ${result.convertedCount + result.skippedCount} 个图片\n`;
				message += `   • 已转换: ${result.convertedCount}\n`;
				message += `   • 已跳过: ${result.skippedCount}`;

				// 如果启用了详细日志，显示每个图片的状态
				if (this.settings.showDetailedLog) {
					message += '\n\n';

					// 显示每个图片的详细状态
					const maxDisplay = 8; // 最多显示8个图片的详情
					const detailsToShow = result.details.slice(0, maxDisplay);

					for (const detail of detailsToShow) {
						const fileName = detail.path.split('/').pop() || detail.path;
						const shortName = fileName.length > 35 ? fileName.substring(0, 32) + '...' : fileName;

						if (detail.status === 'success') {
							message += `✓ ${shortName}\n`;
						} else if (detail.status === 'failed') {
							message += `✗ ${shortName}\n  → ${detail.reason}\n`;
						} else if (detail.status === 'skipped') {
							message += `⊘ ${shortName}\n  → ${detail.reason}\n`;
						}
					}

					// 如果还有更多图片未显示
					if (result.details.length > maxDisplay) {
						const remaining = result.details.length - maxDisplay;
						message += `\n... 还有 ${remaining} 个`;
					}
				}

				// 显示时间更长的通知（8秒）
				new Notice(message, 8000);
			} else {
				new Notice(`✅ 已导出为 Base64 格式文件: ${exportFileName}`);
			}
		} catch (error) {
			new Notice('❌ 导出失败: ' + error.message);
			console.error('Export failed:', error);
		}
	}

	// ========== 显示详细处理结果 ==========
	showDetailedResults(result: { content: string, convertedCount: number, skippedCount: number, details: Array<{ path: string, status: string, reason?: string }> }) {
		const total = result.convertedCount + result.skippedCount;

		// 主通知
		let message = '✅ 已复制到剪贴板\n\n';

		message += `📊 统计: ${total} 个图片\n`;
		message += `   • 已转换: ${result.convertedCount}\n`;
		message += `   • 已跳过: ${result.skippedCount}`;

		// 如果启用了详细日志，显示每个图片的状态
		if (this.settings.showDetailedLog) {
			message += '\n\n';

			// 显示每个图片的详细状态
			const maxDisplay = 8; // 最多显示8个图片的详情
			const detailsToShow = result.details.slice(0, maxDisplay);

			for (const detail of detailsToShow) {
				const fileName = detail.path.split('/').pop() || detail.path;
				const shortName = fileName.length > 35 ? fileName.substring(0, 32) + '...' : fileName;

				if (detail.status === 'success') {
					message += `✓ ${shortName}\n`;
				} else if (detail.status === 'failed') {
					message += `✗ ${shortName}\n  → ${detail.reason}\n`;
				} else if (detail.status === 'skipped') {
					message += `⊘ ${shortName}\n  → ${detail.reason}\n`;
				}
			}

			// 如果还有更多图片未显示
			if (result.details.length > maxDisplay) {
				const remaining = result.details.length - maxDisplay;
				message += `\n... 还有 ${remaining} 个`;
			}
		}

		// 显示控制台提示
		message += `\n\n💡 控制台 (Ctrl+Shift+I) 查看完整详情`;

		// 显示时间更长的通知（8秒）
		new Notice(message, 8000);
	}

	// ========== 核心转换逻辑 ==========
	async convertMarkdownToBase64(content: string, sourceFile: TFile): Promise<{ content: string, convertedCount: number, skippedCount: number, details: Array<{ path: string, status: string, reason?: string }> }> {
		// 匹配 Markdown 图片语法: ![alt](path) 或 ![alt](<path>)
		// 支持 Obsidian 的 ![[image.png]] 语法
		const imgRegex = /!\[([^\]]*)\]\(<?([^)">]+)>?\)|!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg|bmp))\]\]/gi;

		let result = content;
		let convertedCount = 0;
		let skippedCount = 0;
		const details: Array<{ path: string, status: string, reason?: string }> = [];

		const matches = [...content.matchAll(imgRegex)];

		if (this.settings.showConversionLog) {
			console.log(`[MDImageEmbed] 开始处理文档，共找到 ${matches.length} 个图片`);
		}

		for (const match of matches) {
			const fullMatch = match[0];

			// 处理标准 Markdown 语法: ![alt](path)
			if (match[1] !== undefined) {
				const altText = match[1];
				const imagePath = match[2];

				// 跳过已经是 base64 的图片
				if (this.settings.skipBase64Images && imagePath.startsWith('data:image')) {
					skippedCount++;
					const displayPath = imagePath.substring(0, 30) + '...';
					details.push({ path: displayPath, status: 'skipped', reason: '已是 Base64 格式' });
					if (this.settings.showConversionLog) {
						console.log(`[跳过] ${displayPath} - 原因: 已是 Base64 格式`);
					}
					continue;
				}

				// 跳过网络图片（不支持）
				if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
					skippedCount++;
					details.push({ path: imagePath, status: 'skipped', reason: '网络图片（不支持）' });
					if (this.settings.showConversionLog) {
						console.log(`[跳过] ${imagePath} - 原因: 网络图片不支持转换`);
					}
					continue;
				}

				// 转换本地图片
				const base64 = await this.imageToBase64(imagePath, sourceFile);
				if (base64) {
					result = result.replace(fullMatch, `![${altText}](${base64})`);
					convertedCount++;
					details.push({ path: imagePath, status: 'success' });
					if (this.settings.showConversionLog) {
						console.log(`[成功] ${imagePath} - 已转换为 Base64`);
					}
				} else {
					skippedCount++;
					details.push({ path: imagePath, status: 'failed', reason: 'File not found' });
					if (this.settings.showConversionLog) {
						console.log(`[失败] ${imagePath} - 原因: 文件未找到或读取失败`);
					}
				}
			}
			// 处理 Obsidian Wiki 语法: ![[image.png]]
			else if (match[3] !== undefined) {
				const imageName = match[3];
				const displayPath = `![[${imageName}]]`;

				// 如果不转换 Wiki 链接，跳过
				if (!this.settings.convertWikiLinks) {
					skippedCount++;
					details.push({ path: displayPath, status: 'skipped', reason: 'Wiki 链接转换已禁用' });
					if (this.settings.showConversionLog) {
						console.log(`[跳过] ${displayPath} - 原因: Wiki 链接转换已禁用`);
					}
					continue;
				}

				// 转换为 base64
				const base64 = await this.imageToBase64(imageName, sourceFile);
				if (base64) {
					// 转换为标准 Markdown 语法
					result = result.replace(fullMatch, `![${imageName}](${base64})`);
					convertedCount++;
					details.push({ path: displayPath, status: 'success' });
					if (this.settings.showConversionLog) {
						console.log(`[成功] ${displayPath} - 已转换为 Base64`);
					}
				} else {
					skippedCount++;
					details.push({ path: displayPath, status: 'failed', reason: 'File not found' });
					if (this.settings.showConversionLog) {
						console.log(`[失败] ${displayPath} - 原因: 文件未找到或读取失败`);
					}
				}
			}
		}

		if (this.settings.showConversionLog) {
			console.log(`[MDImageEmbed] 处理完成: ${convertedCount} 个成功, ${skippedCount} 个跳过`);
		}
		return { content: result, convertedCount, skippedCount, details };
	}

	// ========== 图片转 Base64 ==========
	async imageToBase64(imagePath: string, sourceFile: TFile): Promise<string | null> {
		try {
			// 解析图片路径
			const imageFile = this.resolveImagePath(imagePath, sourceFile);
			if (!imageFile) {
				if (this.settings.showConversionLog) {
					console.warn(`  └─ 路径解析失败: 在以下位置都未找到文件`);
					console.warn(`     - Vault 根目录: ${imagePath}`);
					if (sourceFile.parent) {
						console.warn(`     - 相对路径: ${sourceFile.parent.path}/${imagePath}`);
					}
				}
				return null;
			}

			if (this.settings.showConversionLog) {
				console.log(`  └─ 文件已找到: ${imageFile.path}`);
			}

			// 读取图片为 ArrayBuffer
			const arrayBuffer = await this.app.vault.readBinary(imageFile);

			// 转换为 Base64
			const base64 = this.arrayBufferToBase64(arrayBuffer);

			// 获取 MIME 类型
			const mimeType = this.getMimeType(imageFile.extension);

			if (this.settings.showConversionLog) {
				const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(2);
				console.log(`  └─ 文件大小: ${sizeKB} KB, MIME: ${mimeType}`);
			}

			return `data:${mimeType};base64,${base64}`;
		} catch (error) {
			if (this.settings.showConversionLog) {
				console.error(`  └─ 读取或转换失败: ${error.message}`);
			}
			return null;
		}
	}

	// ========== 路径解析 ==========
	resolveImagePath(imagePath: string, sourceFile: TFile): TFile | null {
		// 移除 Obsidian 路径前缀
		let cleanPath = imagePath.replace(/^<|>$/g, '').trim();

		// URL 解码（处理 %20 等编码字符）
		try {
			const decoded = decodeURIComponent(cleanPath);
			if (decoded !== cleanPath) {
				if (this.settings.showConversionLog) {
					console.log(`  └─ URL 解码: "${cleanPath}" → "${decoded}"`);
				}
			}
			cleanPath = decoded;
		} catch (e) {
			// 如果解码失败，使用原路径
			if (this.settings.showConversionLog) {
				console.warn(`  └─ URL 解码失败，使用原路径: ${cleanPath}`);
			}
		}

		// 方法 1: 直接从 Vault 根目录查找
		let file = this.app.vault.getAbstractFileByPath(cleanPath);
		if (file instanceof TFile) {
			if (this.settings.showConversionLog) {
				console.log(`  └─ 解析方法: Vault 根目录`);
			}
			return file;
		}

		// 方法 2: 相对于当前文件查找
		if (sourceFile.parent) {
			const relativePath = `${sourceFile.parent.path}/${cleanPath}`;
			file = this.app.vault.getAbstractFileByPath(relativePath);
			if (file instanceof TFile) {
				if (this.settings.showConversionLog) {
					console.log(`  └─ 解析方法: 相对路径 (${sourceFile.parent.path}/)`);
				}
				return file;
			}
		}

		// 方法 3: 使用 Obsidian 的链接解析
		const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, sourceFile.path);
		if (resolvedFile instanceof TFile) {
			if (this.settings.showConversionLog) {
				console.log(`  └─ 解析方法: Obsidian 链接解析`);
			}
			return resolvedFile;
		}

		return null;
	}

	// ========== ArrayBuffer 转 Base64 ==========
	arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	// ========== 获取 MIME 类型 ==========
	getMimeType(extension: string): string {
		const mimeTypes: Record<string, string> = {
			'png': 'image/png',
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'gif': 'image/gif',
			'webp': 'image/webp',
			'svg': 'image/svg+xml',
			'bmp': 'image/bmp'
		};
		return mimeTypes[extension.toLowerCase()] || 'image/png';
	}
}

// ========== 设置面板 ==========
class MDImageEmbedSettingTab extends PluginSettingTab {
	plugin: MDImageEmbedPlugin;

	constructor(app: App, plugin: MDImageEmbedPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'MD Image Embed 设置' });

		// 设置 1: 显示转换日志
		new Setting(containerEl)
			.setName('显示转换日志')
			.setDesc('在通知中显示转换摘要信息')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showConversionLog)
				.onChange(async (value) => {
					this.plugin.settings.showConversionLog = value;
					await this.plugin.saveSettings();
					// 重新渲染设置面板以更新详细日志选项的可见性
					this.display();
				}));

		// 设置 1.5: 显示详细日志（依赖于 showConversionLog）
		if (this.plugin.settings.showConversionLog) {
			new Setting(containerEl)
				.setName('显示详细日志')
				.setDesc('在通知中显示每个图片的状态（需要启用"显示转换日志"）')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showDetailedLog)
					.onChange(async (value) => {
						this.plugin.settings.showDetailedLog = value;
						await this.plugin.saveSettings();
					}));
		}

		// 设置 2: 转换 Wiki 链接
		new Setting(containerEl)
			.setName('转换 Wiki 链接')
			.setDesc('将 Obsidian Wiki 链接 (![[image.png]]) 转换为标准 Markdown Base64 格式')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.convertWikiLinks)
				.onChange(async (value) => {
					this.plugin.settings.convertWikiLinks = value;
					await this.plugin.saveSettings();
				}));

		// 设置 3: 跳过 Base64 图片
		new Setting(containerEl)
			.setName('跳过 Base64 图片')
			.setDesc('跳过已经是 Base64 格式的图片')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.skipBase64Images)
				.onChange(async (value) => {
					this.plugin.settings.skipBase64Images = value;
					await this.plugin.saveSettings();
				}));

		// 分隔线
		containerEl.createEl('h3', { text: '防转载保护' });

		// 设置 4: 前缀文件路径
		new Setting(containerEl)
			.setName('前缀文件路径')
			.setDesc('添加到文章开头的 Markdown 文件路径（如 "templates/prefix.md"），留空禁用')
			.addText(text => text
				.setPlaceholder('templates/prefix.md')
				.setValue(this.plugin.settings.prefixFilePath)
				.onChange(async (value) => {
					this.plugin.settings.prefixFilePath = value.trim();
					await this.plugin.saveSettings();
				}));

		// 设置 5: 后缀文件路径
		new Setting(containerEl)
			.setName('后缀文件路径')
			.setDesc('添加到文章结尾的 Markdown 文件路径（如 "templates/suffix.md"），留空禁用')
			.addText(text => text
				.setPlaceholder('templates/suffix.md')
				.setValue(this.plugin.settings.suffixFilePath)
				.onChange(async (value) => {
					this.plugin.settings.suffixFilePath = value.trim();
					await this.plugin.saveSettings();
				}));

		// 分隔线
		containerEl.createEl('h3', { text: '导出设置' });

		// 设置 6: 默认导出路径
		new Setting(containerEl)
			.setName('默认导出路径')
			.setDesc('导出文件的默认保存路径，留空则保存在源文件所在目录')
			.addText(text => text
				.setPlaceholder('exports/')
				.setValue(this.plugin.settings.defaultExportPath)
				.onChange(async (value) => {
					this.plugin.settings.defaultExportPath = value.trim();
					await this.plugin.saveSettings();
				}));

		// 设置 7: 显示侧边栏图标
		new Setting(containerEl)
			.setName('显示侧边栏图标')
			.setDesc('在左侧边栏显示 MD Image Embed 导出按钮')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showRibbonIcon)
				.onChange(async (value) => {
					this.plugin.settings.showRibbonIcon = value;
					await this.plugin.saveSettings();
					// 重新加载插件以应用更改
					this.plugin.app.workspace.trigger('reload-plugins');
				}));

	}
}

// ========== 导出设置对话框 ==========
class ExportDialog extends Modal {
	plugin: MDImageEmbedPlugin;
	file: TFile;
	exportPath: string;
	exportName: string;

	constructor(app: App, plugin: MDImageEmbedPlugin, file: TFile) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		// 设置默认值
		this.exportPath = plugin.settings.defaultExportPath || (file.parent ? file.parent.path : '');
		this.exportName = file.name.replace('.md', '_base64.md');
	}

	onOpen() {
		const { contentEl } = this;

		// 设置对话框标题
		contentEl.createEl('h2', { text: '导出设置' });

		// 导出路径设置
		contentEl.createEl('h3', { text: '导出路径' });
		const pathSetting = new Setting(contentEl)
			.setName('导出文件夹')
			.setDesc('选择导出文件的保存位置');

		// 添加文件夹选择器
		let pathInputEl: HTMLInputElement;
		pathSetting.addText(text => {
			pathInputEl = text.inputEl;
			text
				.setPlaceholder('输入文件夹路径')
				.setValue(this.exportPath)
				.onChange(value => {
					this.exportPath = value;
				});
		});

		// 添加文件夹选择按钮
		pathSetting.addButton(button => button
			.setButtonText('浏览')
			.onClick(() => {
				// 由于Obsidian API限制，这里我们暂时只支持手动输入路径
				new Notice('请手动输入文件夹路径');
			}));

		// 导出文件名设置
		contentEl.createEl('h3', { text: '导出文件名' });
		new Setting(contentEl)
			.setName('文件名')
			.setDesc('设置导出文件的名称')
			.addText(text => text
				.setPlaceholder('输入文件名')
				.setValue(this.exportName)
				.onChange(value => {
					this.exportName = value;
				}));

		// 按钮区域
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '10px';

		// 取消按钮
		new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => {
				this.close();
			});

		// 导出按钮
		new ButtonComponent(buttonContainer)
			.setButtonText('导出')
			.setCta()
			.onClick(async () => {
				// 执行导出
				await this.plugin.exportAsBase64(this.file, this.exportPath, this.exportName);
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
