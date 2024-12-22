const axios = require('axios');
const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');

const GITHUB_API_URL = 'https://api.github.com/search/repositories';
const SEARCH_QUERY = 'eth';
const OUTPUT_FILE = 'hex_strings_found.txt';
const PROJECTS_DIR = 'eth_projects';

async function appendToFile(filePath, data) {
    fs.appendFile(filePath, data + '\n', (err) => {
        if (err) {
            console.error(`写入文件时出错: ${err}`);
        }
    });
}

async function searchGithubProjects(query) {
    const response = await axios.get(GITHUB_API_URL, {
        params: { q: query },
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36' },
    });
    return response.data.items || [];
}

async function cloneRepository(repoUrl, repoPath) {
    const git = simpleGit();
    console.log(`Cloning ${repoUrl}...`);
    await git.clone(repoUrl, repoPath);
}

async function getCommitHashes(repoPath) {
    const git = simpleGit(repoPath);
    const result = await git.raw(['rev-list', '--all']);
    return result.split('\n').filter(Boolean);
}

async function getFilesInCommit(repoPath, commitHash) {
    const git = simpleGit(repoPath);
    const result = await git.raw(['diff-tree', '--no-commit-id', '--name-only', '-r', commitHash]);
    return result.split('\n').filter(Boolean);
}

function findHexStringsInFile(filePath) {
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf-8');
    const hexStrings = content.match(/\b[a-fA-F0-9]{64}\b/g);
    return hexStrings || [];
}

async function extractHexFromRepositories(repositories) {
    const hexMap = new Map(); // 用于存储唯一的十六进制字符串

    for (const repo of repositories) {
        const repoUrl = repo.clone_url;
        const repoName = path.basename(repoUrl, '.git');
        const repoPath = path.join(PROJECTS_DIR, repoName);

        await cloneRepository(repoUrl, repoPath);
        const commitHashes = await getCommitHashes(repoPath);

        for (const commit of commitHashes) {
            const files = await getFilesInCommit(repoPath, commit);
            for (const file of files) {
                const hexStrings = findHexStringsInFile(path.join(repoPath, file));
                hexStrings.forEach(hex=>{
                    if(!hexMap.has(hex)){
                        appendToFile(OUTPUT_FILE,`Hex: ${hex}\n`);
                    }
                });
               
            }
        }

        // 删除克隆的仓库
        await fs.remove(repoPath);
        console.log(`已删除仓库 ${repoPath}`);
    }

    console.log(`查找结果已记录到 ${OUTPUT_FILE}`);
}

(async () => {
    try {
        // 创建项目目录
        if (!fs.existsSync(PROJECTS_DIR)) {
            fs.mkdirSync(PROJECTS_DIR);
        }

        const repositories = await searchGithubProjects(SEARCH_QUERY);
        await extractHexFromRepositories(repositories);
    } catch (error) {
        console.error('发生错误:', error.message);
    }
})();
