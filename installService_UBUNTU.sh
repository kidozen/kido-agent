#! /bin/sh

# Path where kido-agent config.json file is locate
DIR=current-dir
LOGDIR=current-dir/logs
# Full path to node binary
NODE_PATH=node-path
DAEMON="process"
DAEMONOPTS=""

PROCESS_PATH=process-path
PID=/var/run/kido-agent.pid

case "$1" in
      start)
                echo "starting kido-agent"
                start-stop-daemon --start --name kido-agent --chdir $DIR --startas $NODE_PATH $PROCESS_PATH/$DAEMON -- $DAEMONOPTS >> $LOGDIR/kido-agent_output.log 2>> $LOGDIR/kido-agent_err.log &
                echo $! > $PID
            ;;
      stop)
                echo "stopping kido-agent"
                start-stop-daemon --stop --quiet --pidfile $PID

            ;;
      restart)
				$0 stop
				$0 start
            ;;

esac
exit 0
