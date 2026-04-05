import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Task } from '@/types/domain';
import { useTasks, useUpdateTask } from '@/api/queries';
import { transformApiTasks } from '@/utils/transformers';
import { CheckCircle, Clock, AlertTriangle, ArrowUpRight, User } from 'lucide-react';

const statusIcon: Record<Task['status'], React.ReactNode> = {
  'pending': <Clock className="w-4 h-4 text-muted-foreground" />,
  'in-progress': <ArrowUpRight className="w-4 h-4 text-info" />,
  'completed': <CheckCircle className="w-4 h-4 text-success" />,
  'escalated': <AlertTriangle className="w-4 h-4 text-destructive" />,
};

export default function ActionCenter() {
  const [filter, setFilter] = useState('all');
  const { data: apiTasks } = useTasks(filter === 'all' ? undefined : filter);
  const updateTaskMutation = useUpdateTask();

  const taskList = apiTasks ? transformApiTasks(apiTasks) : [];

  const filtered = filter === 'all' ? taskList : taskList.filter(t => t.status === filter);

  const updateStatus = (id: string, status: Task['status']) => {
    updateTaskMutation.mutate({
      taskId: id,
      taskData: { status },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Action Center</h2>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tasks</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['pending', 'in-progress', 'completed', 'escalated'] as const).map(s => (
          <Card key={s}>
            <CardContent className="pt-4 flex items-center gap-3">
              {statusIcon[s]}
              <div>
                <p className="text-2xl font-bold">{taskList.filter(t => t.status === s).length}</p>
                <p className="text-xs text-muted-foreground capitalize">{s}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filtered.map(task => (
          <Card key={task.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  {statusIcon[task.status]}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{task.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{task.assignee}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Due: {task.dueTime}</span>
                      <span>{task.relatedShipment}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={`text-xs priority-${task.priority}`}>{task.priority}</Badge>
                  {task.status !== 'completed' && (
                    <div className="flex gap-1">
                      {task.status === 'pending' && <Button size="sm" variant="outline" onClick={() => updateStatus(task.id, 'in-progress')}>Start</Button>}
                      {task.status === 'in-progress' && <Button size="sm" onClick={() => updateStatus(task.id, 'completed')}>Complete</Button>}
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => updateStatus(task.id, 'escalated')}>Escalate</Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
