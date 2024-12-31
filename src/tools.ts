import { Notice, Platform, TFile } from "obsidian";
import {
    CONFLICT_OUTPUT_FILE,
    DIFF_VIEW_CONFIG,
    SPLIT_DIFF_VIEW_CONFIG,
} from "./constants";
import type ObsidianGit from "./main";
import { getNewLeaf, splitRemoteBranch } from "./utils";
import { SimpleGit } from "./gitManager/simpleGit";
import { GeneralModal } from "./ui/modals/generalModal";

export default class Tools {
    constructor(private readonly plugin: ObsidianGit) {}

    async hasTooBigFiles(files: { vault_path: string }[]): Promise<boolean> {
        const branchInfo = await this.plugin.gitManager.branchInfo();
        const remote = branchInfo.tracking
            ? splitRemoteBranch(branchInfo.tracking)[0]
            : null;

        if (remote) {
            const remoteUrl = await this.plugin.gitManager.getRemoteUrl(remote);

            //Check for files >100mb on GitHub remote
            if (remoteUrl?.includes("github.com")) {
                const tooBigFiles = files.filter((f) => {
                    const file = this.plugin.app.vault.getAbstractFileByPath(
                        f.vault_path
                    );
                    if (file instanceof TFile) {
                        return file.stat.size >= 100000000;
                    }
                    return false;
                });
                if (tooBigFiles.length > 0) {
                    this.plugin.displayError(
                        `Did not commit, because following files are too big: ${tooBigFiles
                            .map((e) => e.vault_path)
                            .join("\n")}. Please remove them.`
                    );

                    return true;
                }
            }
        }
        return false;
    }
    async writeAndOpenFile(text?: string) {
        if (text !== undefined) {
            await this.plugin.app.vault.adapter.write(
                CONFLICT_OUTPUT_FILE,
                text
            );
        }
        let fileIsAlreadyOpened = false;
        this.plugin.app.workspace.iterateAllLeaves((leaf) => {
            if (
                leaf.getDisplayText() != "" &&
                CONFLICT_OUTPUT_FILE.startsWith(leaf.getDisplayText())
            ) {
                fileIsAlreadyOpened = true;
            }
        });
        if (!fileIsAlreadyOpened) {
            await this.plugin.app.workspace.openLinkText(
                CONFLICT_OUTPUT_FILE,
                "/",
                true
            );
        }
    }

    openDiff({
        aFile,
        bFile,
        aRef,
        bRef,
        event,
    }: {
        aFile: string;
        bFile?: string;
        aRef: string;
        bRef?: string;
        event?: MouseEvent;
    }) {
        let diffStyle = this.plugin.settings.diffStyle;
        if (Platform.isMobileApp) {
            diffStyle = "git_unified";
        }

        const state = {
            aFile: aFile,
            bFile: bFile ?? aFile,
            aRef: aRef,
            bRef: bRef,
        };

        if (diffStyle == "split") {
            void getNewLeaf(this.plugin.app, event)?.setViewState({
                type: SPLIT_DIFF_VIEW_CONFIG.type,
                active: true,
                state: state,
            });
        } else if (diffStyle == "git_unified") {
            void getNewLeaf(this.plugin.app, event)?.setViewState({
                type: DIFF_VIEW_CONFIG.type,
                active: true,
                state: state,
            });
        }
    }

    async runRawCommand() {
        const gitManager = this.plugin.gitManager;
        if (!(gitManager instanceof SimpleGit)) {
            return;
        }
        const modal = new GeneralModal(this.plugin, {
            placeholder: "push origin master",
            allowEmpty: false,
        });
        const command = await modal.openAndGetResult();
        if (command === undefined) return;

        this.plugin.promiseQueue.addTask(async () => {
            const notice = new Notice(`Running '${command}'...`, 999_999);

            try {
                const res = await gitManager.rawCommand(command);
                if (res) {
                    notice.setMessage(res);
                    window.setTimeout(() => notice.hide(), 5000);
                } else {
                    notice.hide();
                }
            } catch (e) {
                notice.hide();
                throw e;
            }
        });
    }
}
