const express = require('express');
const app = express();
const child = require('child_process');
const fs = require('fs');
const os = require('os');
const Path = require('path');
const { promisify } = require('util');


const exec = promisify(child.exec);
const exists = promisify(fs.exists);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);


const preProjectDir = Path.join(__dirname, 'pre-projects');
const prodProjectDir = Path.join(__dirname, 'prod-projects');

app.use(express.json());

app.post('/payload', async (req, res) => {
    const { action, repository, release } = req.body;
    if (action !== 'published') {
        return res.json({ message: 'do not thing' });
    }

    // 创建一个锁文件, 不允许同时操作同一个项目
    const lockFile = Path.join(os.tmpdir(), 'auto-update-project-' + repository.name + '.lock');
    if (await exists(lockFile)) {
        return res.json({ message: 'locking' });
    } else {
        await writeFile(lockFile, 'locking', 'utf8');
    }

    try {
        const basePath = release.prerelease ? preProjectDir : prodProjectDir;
        const projectPath = Path.join(basePath, repository.name);
        if (!(await exists(basePath))) {
            await mkdir(basePath, { recursive: true });
        }

        if (!(await exists(projectPath))) {
            await exec(`git clone ${repository.ssh_url} ${repository.name}`, { cwd: basePath });
        } else {
            await exec('git fetch --all', { cwd: projectPath });
        }
        await exec(`git checkout ${release.tag_name}`, { cwd: projectPath });
        res.json({ message: 'ok' });
    } catch (err) {
        console.error(err);
        res.sendStatus(403);
        res.json({ message: err.message });
    } finally {
        // 移除锁文件
        if (await exists(lockFile)) {
            await unlink(lockFile);
        }
    }
});

app.get('/', async (req, res) => {
    res.json({
        'pre_projects': await getProjectList(preProjectDir),
        'prod_projects': await getProjectList(prodProjectDir)
    });
});

async function getProjectList(dir) {
    if (await exists(dir)) {
        const arr = [];
        const files = await readdir(dir);
        for (const fname of files) {
            arr.push({
                name: fname,
                version: await getProjectVersion(dir, fname)
            });
        }
        return arr;
    } else return [];
}

async function getProjectVersion(dir, name) {
    const packageFile = Path.join(dir, name, 'package.json');
    const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
    return pkg.version || '0.0.0';
}

app.listen(8743);



