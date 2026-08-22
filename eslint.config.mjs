import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    {
        ignores: ['node_modules/**'],
    },
    js.configs.recommended,
    prettier,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none'}],
        },
    },
    {
        files: ['**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
    },
    {
        // Legacy parsers, kept close to their upstream FHEM counterparts. Reformatting them
        // would make the diff against fhem's 11_FHT.pm / MAX modules unreadable - see ROADMAP.md.
        files: ['lib/fht.js', 'lib/moritz.js'],
        rules: {
            'no-unused-vars': 'off',
            'no-fallthrough': 'off',
            'no-duplicate-case': 'off',
            'no-irregular-whitespace': 'off',
            'no-useless-assignment': 'off',
            'no-redeclare': 'off',
            'no-case-declarations': 'off',
        },
    },
];
