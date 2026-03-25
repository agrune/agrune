import { useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TaskDetailDialog } from '@/components/features/TaskDetailDialog'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import type { Member, Task, TaskStatus } from '@/types'
import { COLUMNS, PRIORITY_COLORS, STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'

interface KanbanBoardProps {
  tasks: Task[]
  members: Member[]
  onTasksChange: (tasks: Task[]) => void
  onNewTask: () => void
}

export function KanbanBoard({ tasks, members, onTasksChange, onNewTask }: KanbanBoardProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null)
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const dragCounter = useRef<Record<string, number>>({})
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null

  const getColumnTasks = useCallback(
    (status: TaskStatus) =>
      tasks
        .filter((t) => t.status === status)
        .sort((a, b) => a.order - b.order),
    [tasks]
  )

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
    // Add a slight delay for visual feedback
    const el = e.currentTarget as HTMLElement
    requestAnimationFrame(() => {
      el.style.opacity = '0.5'
    })
  }

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement
    el.style.opacity = '1'
    setDraggedTask(null)
    setDragOverColumn(null)
    setDragOverTaskId(null)
    dragCounter.current = {}
  }

  const handleColumnDragEnter = (e: React.DragEvent, columnId: TaskStatus) => {
    e.preventDefault()
    dragCounter.current[columnId] = (dragCounter.current[columnId] || 0) + 1
    setDragOverColumn(columnId)
  }

  const handleColumnDragLeave = (_e: React.DragEvent, columnId: TaskStatus) => {
    dragCounter.current[columnId] = (dragCounter.current[columnId] || 0) - 1
    if (dragCounter.current[columnId] <= 0) {
      dragCounter.current[columnId] = 0
      if (dragOverColumn === columnId) {
        setDragOverColumn(null)
      }
    }
  }

  const handleColumnDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleTaskDragOver = (e: React.DragEvent, taskId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverTaskId(taskId)
  }

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus, targetTaskId?: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedTask) return

    const newTasks = tasks.filter((t) => t.id !== draggedTask.id)
    const columnTasks = newTasks
      .filter((t) => t.status === targetStatus)
      .sort((a, b) => a.order - b.order)

    let insertIndex: number
    if (targetTaskId) {
      const targetIdx = columnTasks.findIndex((t) => t.id === targetTaskId)
      insertIndex = targetIdx >= 0 ? targetIdx : columnTasks.length
    } else {
      insertIndex = columnTasks.length
    }

    const updatedTask = { ...draggedTask, status: targetStatus }

    // Recalculate orders for the target column
    const otherTasks = newTasks.filter((t) => t.status !== targetStatus)
    const reorderedColumnTasks = [...columnTasks]
    reorderedColumnTasks.splice(insertIndex, 0, updatedTask)
    const finalColumnTasks = reorderedColumnTasks.map((t, i) => ({ ...t, order: i }))

    onTasksChange([...otherTasks, ...finalColumnTasks])
    setDraggedTask(null)
    setDragOverColumn(null)
    setDragOverTaskId(null)
    dragCounter.current = {}
  }

  const handleDeleteTask = (taskId: string) => {
    onTasksChange(tasks.filter((t) => t.id !== taskId))
  }

  const handleUpdateTask = (updatedTask: Task) => {
    const currentTask = tasks.find((task) => task.id === updatedTask.id)
    if (!currentTask) return

    if (currentTask.status === updatedTask.status) {
      onTasksChange(tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)))
      return
    }

    const remainingTasks = tasks.filter((task) => task.id !== updatedTask.id)
    const sourceColumnTasks = remainingTasks
      .filter((task) => task.status === currentTask.status)
      .sort((a, b) => a.order - b.order)
      .map((task, index) => ({ ...task, order: index }))
    const targetColumnTasks = [
      ...remainingTasks.filter((task) => task.status === updatedTask.status),
      { ...updatedTask, order: Number.MAX_SAFE_INTEGER },
    ]
      .sort((a, b) => a.order - b.order)
      .map((task, index) => ({ ...task, order: index }))
    const untouchedTasks = remainingTasks.filter(
      (task) => task.status !== currentTask.status && task.status !== updatedTask.status
    )

    onTasksChange([...untouchedTasks, ...sourceColumnTasks, ...targetColumnTasks])
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Kanban Board</h2>
            <p className="text-muted-foreground">
              Drag tasks between columns, or double-click any card to inspect and edit it.
            </p>
          </div>
          <Button onClick={onNewTask} size="sm" data-agrune-action="click" data-agrune-name="New Task" data-agrune-desc="Open new task wizard" data-agrune-key="btn-new-task" data-agrune-group="board-actions" data-agrune-group-name="Board Actions" data-agrune-group-desc="Create and manage tasks on the kanban board">
            <Plus className="mr-1 h-4 w-4" />
            New Task
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const columnTasks = getColumnTasks(column.id)
            const isOver = dragOverColumn === column.id

            return (
              <div
                key={column.id}
                className={cn(
                  'rounded-lg border-2 border-dashed p-3 min-h-[280px] md:min-h-[500px] transition-colors',
                  isOver ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/30'
                )}
                onDragEnter={(e) => handleColumnDragEnter(e, column.id)}
                onDragLeave={(e) => handleColumnDragLeave(e, column.id)}
                onDragOver={handleColumnDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge className={cn(STATUS_COLORS[column.id], 'text-xs')}>
                      {column.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground font-medium">
                      {columnTasks.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {columnTasks.map((task) => (
                    <Card
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleTaskDragOver(e, task.id)}
                      onDrop={(e) => handleDrop(e, column.id, task.id)}
                      onDoubleClick={() => setSelectedTaskId(task.id)}
                      className={cn(
                        'cursor-grab active:cursor-grabbing transition-all hover:shadow-md group',
                        draggedTask?.id === task.id && 'opacity-50',
                        dragOverTaskId === task.id &&
                          draggedTask?.id !== task.id &&
                          'border-t-2 border-t-primary'
                      )}
                    >
                      <CardHeader className="p-3 pb-1">
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-center gap-1.5">
                            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                            <CardTitle className="text-sm font-medium leading-tight">
                              {task.title}
                            </CardTitle>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteTask(task.id)
                            }}
                            data-agrune-action="click"
                            data-agrune-name={`Delete ${task.title}`}
                            data-agrune-desc={`Remove task "${task.title}" from the board`}
                            data-agrune-key={`delete-${task.id}`}
                            data-agrune-group="task-actions"
                            data-agrune-group-name="Task Actions"
                            data-agrune-group-desc="Delete or interact with individual task cards"
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 pt-1">
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {task.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] px-1.5 py-0', PRIORITY_COLORS[task.priority])}
                          >
                            {task.priority}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {task.assignee}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {columnTasks.length === 0 && !isOver && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No tasks
                    </div>
                  )}

                  {isOver && draggedTask && (
                    <div className="border-2 border-dashed border-primary/50 rounded-lg p-4 text-center text-sm text-muted-foreground">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <TaskDetailDialog
        task={selectedTask}
        open={selectedTask !== null}
        members={members}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskId(null)
        }}
        onSave={handleUpdateTask}
      />
    </>
  )
}
