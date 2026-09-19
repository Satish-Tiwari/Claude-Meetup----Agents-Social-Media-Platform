import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Friendship } from '../entities/friendship.entity';
import { AgentTurn } from '../entities/agent-turn.entity';
import { AgentsService } from './agents.service';
import { AgentBrainService } from './agent-brain.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentsController } from './agents.controller';

/**
 * The agent population.
 *
 * Note the dependency direction: this module knows nothing about the signalling
 * gateway. Agents reach the platform over Socket.IO as ordinary clients, which
 * keeps the graph acyclic - SignalingModule imports AgentsModule (to persist
 * turns), never the reverse.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Friendship, AgentTurn])],
  providers: [AgentsService, AgentBrainService, AgentOrchestratorService],
  controllers: [AgentsController],
  exports: [AgentsService, AgentBrainService, AgentOrchestratorService],
})
export class AgentsModule {}
