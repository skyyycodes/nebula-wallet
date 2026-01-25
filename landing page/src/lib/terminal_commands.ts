const helpResponse = `
WINTER COMMANDS:
clear              Clear the terminal
--help             Show available commands
--commands         Show nebula commands
--platform         Show platform details
--hotkeys          Show hot keys/ shortcuts
`;

const hotKeysResponse = `
HOT KEYS:
Ctrl + Shift + ~           Switch Terminal Tabs
Ctrl + Shift + d           Toggle shell
`;

const platformResponse = `
PLATFORM DETAILS:
portal              Nebula
version             1.0.0
shell               winter
`;

const commandsResponse = `
SHELL COMMANDS:
winter build                to build the contract
winter test                 to run the test file


PREMIUM(+) SHELL COMMANDS:
winter deploy --devnet      to deploy the contract on devnet
winter deploy --mainnet     to deploy the contract on mainnet
`;

// instead of using winter deploy cmds like this use them like this
// winter deploy --network devnet
// winter deploy --network mainnet
// winter deploy --network <custom-network>

// const nebulaBuildResponse = ``;

export enum COMMAND_WRITER {
    CLEAR = 'clear',
    HELP = '--help',
    HOT_KEYS = '--hotkeys',
    PLATFORM = '--platform',
    COMMANDS = '--commands',
    NEBULA_BUILD = 'winter build',
    NEBULA_TEST = 'winter test',
    NEBULA_DEPLOY_DEVNET = 'winter deploy --devnet',
    NEBULA_DEPLOY_MAINNET = 'winter deploy --mainnet',
}

export const CommandResponse: Record<COMMAND_WRITER, string> = {
    [COMMAND_WRITER.CLEAR]: '',
    [COMMAND_WRITER.HELP]: helpResponse,
    [COMMAND_WRITER.HOT_KEYS]: hotKeysResponse,
    [COMMAND_WRITER.PLATFORM]: platformResponse,
    [COMMAND_WRITER.COMMANDS]: commandsResponse,
    [COMMAND_WRITER.NEBULA_BUILD]: `this feature is forging in the Nebula labs, arriving in an upcoming release...`,
    [COMMAND_WRITER.NEBULA_TEST]: `this feature is forging in the Nebula labs, arriving in an upcoming release...`,
    [COMMAND_WRITER.NEBULA_DEPLOY_DEVNET]: `this feature is forging in the Nebula labs, arriving in an upcoming release...`,
    [COMMAND_WRITER.NEBULA_DEPLOY_MAINNET]: `this feature is forging in the Nebula labs, arriving in an upcoming release...`,
};
