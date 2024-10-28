import { Octokit } from '@octokit/core';
import * as core from '@actions/core';
import fs from 'fs/promises';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

async function main() {
    const owner = core.getInput('owner');
    const repo = core.getInput('repo');
    const token = core.getInput('token');
    const branch = process.env.GITHUB_REF.split('/').pop(); // Captura a branch atual

    const octokit = new Octokit({
        auth: token
    });

    async function getCommitsByUser(owner, repo) {
        try {
            const response = await octokit.request('GET /repos/{owner}/{repo}/commits', {
                owner,
                repo,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            const groupedCommits = {
                feat: [],
                fix: [],
                config: [],
                other: []
            };

            response.data.forEach(commit => {
                const url = commit.html_url;
                const shortSha = url.split('commit/')[1].substring(0, 7);
                const message = commit.commit.message;
                const authorName = commit.commit.author.name;

                const stringCut = commit.commit.message.includes(':') ? commit.commit.message.split(':')[0] : '';

                const line = `- (<a href="${url}">${shortSha}</a>) - <${authorName}> - ${message.replace(stringCut + ':', '').trim()}`;

                const commitMessage = commit.commit.message.toLowerCase();

                if (commitMessage.startsWith('feat')) {
                    groupedCommits.feat.push(line);
                } else if (commitMessage.startsWith('fix')) {
                    groupedCommits.fix.push(line);
                } else if (commitMessage.startsWith('config')) {
                    groupedCommits.config.push(line);
                } else if (!commitMessage.startsWith('chore')) {
                    groupedCommits.other.push(line);
                }
            });

            console.log(groupedCommits);

            const featsMarkdown = groupedCommits.feat.join('\n');
            const fixesMarkdown = groupedCommits.fix.join('\n');
            const configsMarkdown = groupedCommits.config.join('\n');

            let baseMarkdown = `# ${repo}\n##### by ${owner}\n`;

            if (groupedCommits.feat.length > 0) {
                baseMarkdown += `### Features\n\n${featsMarkdown}\n\n`;
            }

            if (groupedCommits.config.length > 0) {
                baseMarkdown += `### Configurations\n\n${configsMarkdown}\n\n`;
            }

            if (groupedCommits.fix.length > 0) {
                baseMarkdown += `### Issues\n\n${fixesMarkdown}\n\n`;
            }

            console.log(baseMarkdown);

            // Verifica se o arquivo já existe e o exclui se necessário
            try {
                await fs.stat('CHANGELOG.md');
                await fs.unlink('CHANGELOG.md');
                console.log(`CHANGELOG.md foi excluído.`);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.error('Erro ao verificar ou excluir o arquivo:', err);
                    return;
                }
            }
            await fs.writeFile('CHANGELOG.md', baseMarkdown);
        } catch (error) {
            console.error('Erro ao buscar commits:', error);
        }
    }

    await getCommitsByUser(owner, repo);
    await createPullRequest(owner, repo, branch, token);
}

async function createPullRequest(owner, repo, branch, token) {
    const octokit = new Octokit({ auth: token });

    try {
        const response = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
            owner,
            repo,
            title: "ChangeLog",
            body: "New Change log file",
            head: branch,
            base: "main",
        });

        console.log(`Pull request criado: ${response.data.html_url}`);
    } catch (error) {
        console.error('Erro ao criar pull request:', error);
    }
}

main().catch(error => {
    console.error('Erro na execução do script:', error);
    process.exit(1);
});
