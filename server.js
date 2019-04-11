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

app.post('/payload', useSafe(async (req, res) => {
    const { action } = res.body;
    if (action === 'published') {
        return release(req, res);
    } else if (action === 'create') {
        return prerelease(req, res);
    } else {
        return res.json({ message: 'do not thing' });
    }
}));

app.get('/', useSafe(async (req, res) => {
    res.json({
        'pre_projects': await getProjectList(preProjectDir),
        'prod_projects': await getProjectList(prodProjectDir)
    });
}));

async function release(req, res) {
    const { repository, release } = req.body;
    try {
        await useLock(repository.name, async () => {
            await update(prodProjectDir, repository.name, release.tag_name, repository.ssh_url);
            res.json({ message: 'ok' });
        });
    } catch (err) {
        console.error(err);
        res.sendStatus(403);
        res.json({ message: err.message });
    }
}

async function prerelease(req, res) {
    const { repository, ref, ref_type } = req.body;
    if (ref_type !== 'tag') {
        return res.json({ message: 'do nothing'});
    }
    try {
        await useLock(repository.name, async () => {
            await update(preProjectDir, repository.name, ref, repository.ssh_url);
            res.json({ message: 'ok' });
        });
    } catch (err) {
        console.error(err);
        res.sendStatus(403);
        res.json({ message: err.message });
    }
}

async function update(basePath, projectName, tag, ssh_url) {
    const projectPath = Path.join(basePath, projectName);
    if (!(await exists(basePath))) {
        await mkdir(basePath, { recursive: true });
    }

    if (!(await exists(projectPath))) {
        await exec(`git clone ${ssh_url} ${projectName}`, { cwd: basePath });
    } else {
        await exec('git fetch --all', { cwd: projectPath });
    }
    await exec(`git checkout ${tag}`, { cwd: projectPath });
}

async function useLock(projectName, fn) {
    // 创建一个锁文件, 不允许同时操作同一个项目
    const lockFile = Path.join(os.tmpdir(), 'auto-update-project-' + projectName + '.lock');
    if (await exists(lockFile)) {
        return res.json({ message: 'locking' });
    } else {
        await writeFile(lockFile, 'locking', 'utf8');
    }

    try {
        return fn();
    } finally {
        // 移除锁文件
        if (await exists(lockFile)) {
            await unlink(lockFile);
        }
    }
}

function useSafe(fn) {
    return (req, res) => {
        fn(req, res).catch(console.error);
    };
}

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



