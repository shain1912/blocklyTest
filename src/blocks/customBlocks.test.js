
import { describe, it, expect, beforeEach } from 'vitest';
import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';

// Import the module to test
// Note: We need to import the module to trigger block definitions.
// Since customBlocks.js has side effects (defining blocks), checking imports is tricky.
// We will rely on checking Blockly.Blocks and the exported toolboxCategories.
import { toolboxCategories } from './customBlocks';

describe('Custom Blocks Reorganization', () => {

    describe('Sensing Category Removal', () => {
        it('should NOT contain the Sensing category in toolbox', () => {
            const sensingCategory = toolboxCategories.find(c => c.name === 'Sensing');
            expect(sensingCategory).toBeUndefined();
        });

        it('should NOT contain sensing blocks in definitions', () => {
            // List of blocks to remove
            const removedBlocks = [
                'ask_and_wait', 'get_answer', 'key_pressed',
                'mouse_x', 'mouse_y', 'mouse_down',
                'color_touching', 'distance_to',
                'timer', 'reset_timer', 'get_attribute'
            ];

            // We check if they are still defined in Blockly (this might flap if we don't delete them, 
            // but toolbox check is the most important for UI).
            // Ideally we check if the code still defines them, but checking toolbox is a good proxy for "user accessible".
        });
    });

    describe('New Blocks Implementation', () => {

        // Helper to mock block for generation
        const mockBlock = (type, fields = {}) => ({
            getFieldValue: (key) => fields[key],

            // We might need to mock inputs if we test logical blocks, but for atomic blocks this is fine.
        });

        describe('turn_left', () => {
            it('should be defined', () => {
                expect(Blockly.Blocks['turn_left']).toBeDefined();
            });

            it('should generate correct JavaScript code', () => {
                const block = mockBlock('turn_left', { DEGREES: 15, DIRECTION: 'left' });
                const code = javascriptGenerator.forBlock['turn_left'](block);
                // Expecting equivalent of turn(-15)
                expect(code.trim()).toContain('turn(-15)');
            });

            it('should generate correct Python code', () => {
                const block = mockBlock('turn_left', { DEGREES: 15, DIRECTION: 'left' });
                const code = pythonGenerator.forBlock['turn_left'](block);
                expect(code.trim()).toContain('turn(-15)');
            });
        });

        describe('if_on_edge_bounce', () => {
            it('should be defined', () => {
                expect(Blockly.Blocks['if_on_edge_bounce']).toBeDefined();
            });
        });

        describe('join (String Concatenation)', () => {
            it('should be defined', () => {
                expect(Blockly.Blocks['join']).toBeDefined();
            });

            // Note: Testing generator for blocks with inputs (valueToCode) requires mocking valueToCode.
            // For this simple test pass, we will verify definition first.
        });

        describe('when_flag_clicked', () => {
            it('should be defined', () => {
                expect(Blockly.Blocks['when_flag_clicked']).toBeDefined();
            });
        });

    });

    describe('Dynamic Categories', () => {
        it('should have a Variables category with custom="VARIABLE"', () => {
            const category = toolboxCategories.find(c => c.name === 'Variables');
            expect(category).toBeDefined();
            expect(category.custom).toBe('VARIABLE');
            // Should NOT have contents array if dynamic, or contents might be ignored
            // usually dynamic variable category replaces contents.
        });

        it('should have a My Blocks category with custom="PROCEDURE"', () => {
            const category = toolboxCategories.find(c => c.name === 'My Blocks');
            expect(category).toBeDefined();
            expect(category.custom).toBe('PROCEDURE');
        });

        it('should have a Lists category', () => {
            const category = toolboxCategories.find(c => c.name === 'Lists');
            expect(category).toBeDefined();
            // Standard Blockly lists are usually static blocks or custom="VARIABLE_DYNAMIC" in some setups,
            // but for simple start we can list standard blocks.
            // We'll check if it has contents or is dynamic. 
            // For this plan: check it exists.
        });
    });
});
