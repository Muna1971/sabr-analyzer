// Generate PNG icon from SVG using Electron's nativeImage
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
    // Create a 512x512 icon programmatically using a BrowserWindow
    const { BrowserWindow } = require('electron');

    const win = new BrowserWindow({
        width: 512,
        height: 512,
        show: false,
        webPreferences: { offscreen: true }
    });

    // Load SVG
    const svgPath = path.join(__dirname, 'assets', 'icon.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf-8');

    const html = `<!DOCTYPE html>
    <html><head><style>
        * { margin: 0; padding: 0; }
        body { width: 512px; height: 512px; overflow: hidden; }
        img { width: 512px; height: 512px; }
    </style></head>
    <body><img src="data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}"></body></html>`;

    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    // Wait for render
    await new Promise(r => setTimeout(r, 1000));

    const image = await win.webContents.capturePage();
    const pngBuffer = image.toPNG();

    // Save multiple sizes
    const sizes = [512, 256, 192, 128, 64, 48, 32, 16];

    // Save original 512
    fs.writeFileSync(path.join(__dirname, 'assets', 'icon.png'), pngBuffer);
    console.log('Created: assets/icon.png (512x512)');

    // Resize for other sizes
    for (const size of sizes) {
        const resized = image.resize({ width: size, height: size });
        fs.writeFileSync(path.join(__dirname, 'assets', `icon-${size}.png`), resized.toPNG());
        console.log(`Created: assets/icon-${size}.png`);
    }

    console.log('All icons generated!');
    app.quit();
});
