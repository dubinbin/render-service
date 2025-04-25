# Render Task Orchestration System


[中文文档](./docs/README_zh.md) 

## Description
This system is a Blender-based distributed rendering task orchestration platform that automates the complete workflow from model upload to rendered output storage through modular design. It employs a task queue scheduling mechanism to support high-concurrency rendering operations, with comprehensive status tracking and access control.


## Core Architecture Components


<img src="docs/images/whiteboard_exported_image.png" width="600" alt="System Architecture">

1. Data Storage Layer
​​Model/Material Storage​​: Handles user-uploaded 3D models and material files (OSS/COS object storage)
​​Relational Database​​: Stores rendering task metadata, user permissions, and system logs (labeled "database(data persistence)")
​​Distributed Cache​​: Redis-accelerated task status queries (labeled "distributed cache(id)")
2. Task Scheduling Layer
​​Message Queue (MQ)​​: RabbitMQ/Kafka for asynchronous task processing (labeled "Queue(MQ)")
​​Task Scheduler​​: RenderTask Scheduler Manager handles task allocation and load balancing
​​Execution Logger​​: executilelogger records end-to-end task states
3. Compute Service Layer
​​Render Container Cluster​​: Render Container Server runs Blender+Cycles engine in Docker containers
​​Script Generator​​: Create Rendered Script auto-generates Blender Python execution scripts
4. Management Interface Layer
​​Permission System​​: RBAC-based Permission system (rabec)
​​Frontend UI​​: Frontend UI provides task submission/monitoring interface
​​Model Manager​​: Model data manager system processes model metadata assembly

### Core Workflow

<img src="docs/images/20220d4034596.png" width="600" alt="System Architecture">

### Key Features
​​Status Synchronization​​:
Bidirectional state verification (sync task status ↔ check task status)
Multi-level state storage (DB + cache)
​​Fault Tolerance​​:
Automatic task retries
Atomic render result writes (update render result to database)
​​Security Controls​​:
Model access permission verification
Operation audit logging


Deployment Requirements
# Base Environment
- Docker 20.10+
- Blender 4.0+ (pre-installed in render images)

# Service Dependencies
- Redis 6.2+
- MySql 8.0+
- RabbitMQ 3.9+
  
Usage Example
Upload model files via Frontend UI
System auto-generates task ID
Monitor real-time progress in task console:

# Task status API example
```
GET /api/tasks/{task_id}/status
```
Result files automatically saved to configured object storage